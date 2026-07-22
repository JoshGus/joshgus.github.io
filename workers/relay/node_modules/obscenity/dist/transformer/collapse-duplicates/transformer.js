"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CollapseDuplicatesTransformer = void 0;
class CollapseDuplicatesTransformer {
    defaultThreshold;
    customThresholds;
    remaining = -1;
    lastChar = -1;
    constructor({ defaultThreshold, customThresholds }) {
        this.defaultThreshold = defaultThreshold;
        this.customThresholds = customThresholds;
    }
    transform(char) {
        if (char === this.lastChar) {
            return this.remaining-- > 0 ? char : undefined;
        }
        const threshold = this.customThresholds.get(char) ?? this.defaultThreshold;
        this.remaining = threshold - 1;
        this.lastChar = char;
        return threshold > 0 ? char : undefined;
    }
    reset() {
        this.remaining = -1;
        this.lastChar = -1;
    }
}
exports.CollapseDuplicatesTransformer = CollapseDuplicatesTransformer;
