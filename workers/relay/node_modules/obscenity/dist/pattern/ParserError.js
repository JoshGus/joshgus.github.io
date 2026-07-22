"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ParserError = void 0;
/**
 * Custom error thrown by the parser when syntactical errors are detected.
 */
class ParserError extends Error {
    name = 'ParserError';
    /**
     * The line on which the error occurred (one-based).
     */
    line;
    /**
     * The column on which the error occurred (one-based).
     * Note that surrogate pairs are counted as 1 column wide, not 2.
     */
    column;
    constructor(message, line, column) {
        super(`${line}:${column}: ${message}`);
        this.line = line;
        this.column = column;
    }
}
exports.ParserError = ParserError;
