"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compareIntervals = compareIntervals;
function compareIntervals(lowerBound0, upperBound0, lowerBound1, upperBound1) {
    if (lowerBound0 < lowerBound1)
        return -1;
    if (lowerBound1 < lowerBound0)
        return 1;
    if (upperBound0 < upperBound1)
        return -1;
    if (upperBound1 < upperBound0)
        return 1;
    return 0;
}
