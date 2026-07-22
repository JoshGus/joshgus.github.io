import type { Interval } from '../util/Interval';
export declare class IntervalCollection implements Iterable<Interval> {
    private dirty;
    private readonly intervals;
    insert(lowerBound: number, upperBound: number): void;
    query(lowerBound: number, upperBound: number): boolean;
    values(): ArrayIterator<Interval>;
    [Symbol.iterator](): ArrayIterator<Interval>;
}
