import { Controller, NotImplementedException, ParseUUIDPipe } from '@nestjs/common';
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderPaginationDto } from './dto/order-pagination.dto';
import { ChangeOrderStatusDto } from './dto';
import { OrderWithProducts } from './interfaces/order-with-products.interface';


@Controller()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @MessagePattern('createOrder')
   async create(@Payload() createOrderDto: CreateOrderDto) {

    const order : OrderWithProducts = await this.ordersService.create(createOrderDto);
    const paymentSession = await this.ordersService.createPaymentSession( order );

    return {
      order,
      paymentSession
    }
  }

  @MessagePattern('findAllOrders')
  findAll( @Payload() OrderPaginationDto: OrderPaginationDto) {
    return this.ordersService.findAll(OrderPaginationDto);
  }

  @MessagePattern('findOneOrder')
  findOne(@Payload('id', ParseUUIDPipe ) id: string) {
    return this.ordersService.findOne(id);
  }

  @MessagePattern('changeOrderStatus')
  changeOrderStatus(@Payload() changeOrderStatusDto: ChangeOrderStatusDto ) {
    return this.ordersService.changeOrderStatus( changeOrderStatusDto );
  }



  @EventPattern('payment.succeeded')
  paidOrder( @Payload() paidOrderDto: any ) {
    console.log({ paidOrderDto });

    return
  }

  
}
