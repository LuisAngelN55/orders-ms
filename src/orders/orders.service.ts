import { HttpStatus, Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { PrismaClient } from '@prisma/client';
import { ChangeOrderStatusDto, CreateOrderDto } from './dto';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { OrderPaginationDto } from './dto/order-pagination.dto';
import { firstValueFrom } from 'rxjs';
import { NATS_SERVICE } from 'src/config/services';
import { OrderWithProducts } from './interfaces/order-with-products.interface';

@Injectable()
export class OrdersService extends PrismaClient implements OnModuleInit {

  constructor(
    @Inject( NATS_SERVICE ) private readonly client: ClientProxy,
  ) {
    super();
  }

  private readonly logger = new Logger('OrdersService');

  async onModuleInit() {
    await this.$connect;
    this.logger.log('Database connected');
  }


  async create(createOrderDto: CreateOrderDto) {

    try {
      //1 Confirmar que los productos existen y son validos
      const productIds = createOrderDto.items.map(item => item.productId);

      const products = await firstValueFrom(
        this.client.send({ cmd: 'validate_products' }, productIds)
      );

      //2 Cálculos de los valores
      const totalAmount = createOrderDto.items.reduce((acc, orderItems) => {
        const price = products.find(product => product.id === orderItems.productId).price;
        return acc + (price * orderItems.quantity);
      }, 0);

      const totalItems = createOrderDto.items.reduce((acc, orderItem) => {

        return acc + orderItem.quantity;

      }, 0);

      //3 Crear una transacción de base de datos

      const order = await this.order.create({
        data: {
          totalAmount: totalAmount,
          totalItems: totalItems,
          OrderItems: {
            createMany: {
              data: createOrderDto.items.map((orderItem) => ({
                price: products.find(
                  product => product.id === orderItem.productId
                ).price,
                productId: orderItem.productId,
                quantity: orderItem.quantity

              }))
            }
          }
        },
        include: {
          OrderItems: {
            select: {
              price: true,
              quantity: true,
              productId: true,
            }
          }
        }
      });

      return {
        ...order,
        OrderItems: order.OrderItems.map((orderItem) => ({
          ...orderItem,
          name: products.find((product) => product.id === orderItem.productId).name
        }))
      };

    } catch (error) {
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: 'Chek details or logs',
        error: error
      });
    }


  }

  async findAll(orderPaginationDto: OrderPaginationDto) {
    const totalOrders = await this.order.count({
      where: {
        status: orderPaginationDto.status ? orderPaginationDto.status : undefined,
      }
    });

    const currentPage = orderPaginationDto.page;
    const perPage = orderPaginationDto.limit

    return {
      data: await this.order.findMany({
        skip: (currentPage! - 1) * perPage!,
        take: perPage,
        where: {
          status: orderPaginationDto.status ? orderPaginationDto.status : undefined,
        },
      }),
      meta: {
        totalOrders: totalOrders,
        currentPage: currentPage,
        lastPage: Math.ceil(totalOrders / perPage!),

      }
    }

  }

  async findOne(id: string) {

    const order = await this.order.findFirst({
      where: { id },
      include: {
        OrderItems: {
          select: {
            price: true,
            quantity: true,
            productId: true,
          }
        }
      }
    });

    if (!order) {
      throw new RpcException({
        status: HttpStatus.NOT_FOUND,
        message: `Order with id ${id} not found`
      });
    }


    const productIds = order.OrderItems.map(orderItem => orderItem.productId)
    const products: any[] = await firstValueFrom(
      this.client.send({ cmd: 'validate_products' }, productIds)
    );


    return {
      ...order,
      OrderItems: order.OrderItems.map(orderItem => ({
        ...orderItem,
        name: products.find(product => product.id === orderItem.productId).name
      }))
    }
  }


  async changeOrderStatus(changeOrderStatusDto: ChangeOrderStatusDto) {
    const { id, status } = changeOrderStatusDto;

    const order = await this.findOne(id);

    if (order.status === status) {
      return order;
    }

    return this.order.update({
      where: { id },
      data: { status: status }
    })
  }

  async createPaymentSession( order: OrderWithProducts ) {
    const paymentSession = await firstValueFrom(
      this.client.send('create.payment.session', {
        orderId:order.id,
        currency: 'usd',
        items: order.OrderItems.map( item => ({
          name: item.name,
          price: item.price,
          quantity: item.quantity,
        }))
      })
    )

    return paymentSession;
  }


}
