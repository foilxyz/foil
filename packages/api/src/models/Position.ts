import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  ManyToOne,
  Unique,
  JoinColumn,
  Index,
} from 'typeorm';
import { Transaction } from './Transaction';
import { NUMERIC_PRECISION } from '../constants';
import { Market } from './Market';

@Entity()
@Unique(['positionId', 'market'])
export class Position {
  @OneToMany(() => Transaction, (transaction) => transaction.position)
  transactions: Transaction[];

  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Market, (market) => market.positions)
  @JoinColumn()
  market: Market;

  @Column({ type: 'integer' })
  @Index()
  positionId: number;

  @Column({ type: 'varchar', nullable: true })
  owner: string;

  // Position params
  @Column({ type: 'boolean' })
  isLP: boolean; // true for event name

  @Column({
    type: 'numeric',
    precision: NUMERIC_PRECISION,
    scale: 0,
    nullable: true,
  })
  highPriceTick: string;

  @Column({
    type: 'numeric',
    precision: NUMERIC_PRECISION,
    scale: 0,
    nullable: true,
  })
  lowPriceTick: string;

  @Column({
    type: 'boolean',
    nullable: true,
  })
  isSettled: boolean | null;

  // LP Delta Token Amounts
  @Column({
    type: 'numeric',
    precision: NUMERIC_PRECISION,
    scale: 0,
    nullable: true,
  })
  lpBaseToken: string; // vGas tokenamount 0

  @Column({
    type: 'numeric',
    precision: NUMERIC_PRECISION,
    scale: 0,
    nullable: true,
  })
  lpQuoteToken: string; // vETH tokenamount 1

  // Latest Position State
  @Column({
    type: 'numeric',
    precision: NUMERIC_PRECISION,
    scale: 0,
    nullable: true,
  })
  baseToken: string; // vGas tokenamount 0

  @Column({
    type: 'numeric',
    precision: NUMERIC_PRECISION,
    scale: 0,
    nullable: true,
  })
  quoteToken: string; // vETH tokenamount 1

  @Column({
    type: 'numeric',
    precision: NUMERIC_PRECISION,
    scale: 0,
    nullable: true,
  })
  borrowedBaseToken: string;

  @Column({
    type: 'numeric',
    precision: NUMERIC_PRECISION,
    scale: 0,
    nullable: true,
  })
  borrowedQuoteToken: string;

  @Column({ type: 'numeric', precision: NUMERIC_PRECISION, scale: 0 })
  collateral: string; // ETH
}
