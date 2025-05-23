import { Field, ObjectType, Int, Directive } from 'type-graphql';

@Directive('@cacheControl(maxAge: 30)')
@ObjectType()
export class PnLType {
  @Field(() => Int)
  marketId: number;

  @Field(() => String)
  owner: string;

  @Field(() => String)
  totalDeposits: string;

  @Field(() => String)
  totalWithdrawals: string;

  @Field(() => String)
  openPositionsPnL: string;

  @Field(() => String)
  totalPnL: string;

  @Field(() => [Int])
  positions: number[];

  @Field(() => Int)
  positionCount: number;
}
