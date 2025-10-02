import { Typer } from '../src/Typer';

describe('Typer - All Type Validators', () => {
    let typer: Typer;

    beforeEach(() => {
        typer = new Typer();
    });

    describe('ArrayBuffer validation', () => {
        it('should validate ArrayBuffer', () => {
            const buffer = new ArrayBuffer(8);
            expect(() => typer.isType('array_buffer', buffer)).not.toThrow();
            expect(() => typer.isType('ab', buffer)).not.toThrow();
            expect(() => typer.isType('arr_buff', buffer)).not.toThrow();
        });

        it('should throw for non-ArrayBuffer', () => {
            expect(() => typer.isType('array_buffer', [])).toThrow('must be an ArrayBuffer');
            expect(() => typer.isType('array_buffer', {})).toThrow('must be an ArrayBuffer');
        });
    });

    describe('TypedArray validation', () => {
        it('should validate TypedArray types', () => {
            const int8Array = new Int8Array(4);
            const uint8Array = new Uint8Array(4);
            const float32Array = new Float32Array(4);

            expect(() => typer.isType('typed_array', int8Array)).not.toThrow();
            expect(() => typer.isType('ta', uint8Array)).not.toThrow();
            expect(() => typer.isType('typ_arr', float32Array)).not.toThrow();
        });

        it('should throw for DataView (not TypedArray)', () => {
            const buffer = new ArrayBuffer(8);
            const dataView = new DataView(buffer);
            
            expect(() => typer.isType('typed_array', dataView)).toThrow('must be a TypedArray');
        });

        it('should throw for non-TypedArray', () => {
            expect(() => typer.isType('typed_array', [])).toThrow('must be a TypedArray');
            expect(() => typer.isType('typed_array', {})).toThrow('must be a TypedArray');
        });
    });

    describe('BigInt validation', () => {
        it('should validate bigint', () => {
            const bigintValue = BigInt(123);
            
            expect(() => typer.isType('bigint', bigintValue)).not.toThrow();
            expect(() => typer.isType('bi', bigintValue)).not.toThrow();
            expect(() => typer.isType('bint', bigintValue)).not.toThrow();
        });

        it('should throw for non-bigint', () => {
            expect(() => typer.isType('bigint', 123)).toThrow('must be a bigint, is number');
            expect(() => typer.isType('bigint', '123')).toThrow('must be a bigint, is string');
        });
    });

    describe('DataView validation', () => {
        it('should validate DataView', () => {
            const buffer = new ArrayBuffer(8);
            const dataView = new DataView(buffer);
            
            expect(() => typer.isType('data_view', dataView)).not.toThrow();
            expect(() => typer.isType('dv', dataView)).not.toThrow();
            expect(() => typer.isType('dt_v', dataView)).not.toThrow();
        });

        it('should throw for non-DataView', () => {
            expect(() => typer.isType('data_view', new ArrayBuffer(8))).toThrow('must be a DataView');
            expect(() => typer.isType('data_view', {})).toThrow('must be a DataView');
        });
    });

    describe('Date validation', () => {
        it('should validate valid Date', () => {
            const validDate = new Date('2023-01-01');
            
            expect(() => typer.isType('date', validDate)).not.toThrow();
            expect(() => typer.isType('dt', validDate)).not.toThrow();
        });

        it('should throw for invalid Date', () => {
            const invalidDate = new Date('invalid');
            
            expect(() => typer.isType('date', invalidDate)).toThrow('must be a valid Date');
        });

        it('should throw for non-Date', () => {
            expect(() => typer.isType('date', '2023-01-01')).toThrow('must be a valid Date');
            expect(() => typer.isType('date', 1640995200000)).toThrow('must be a valid Date');
        });
    });

    describe('DOM Element validation', () => {
        // Note: In Node.js environment, HTMLElement is not available
        // These tests are for coverage but will test the error case
        it('should throw for non-DOM elements in Node.js', () => {
            expect(() => typer.isType('dom', {})).toThrow('HTMLElement is not defined');
            expect(() => typer.isType('domel', 'div')).toThrow('HTMLElement is not defined');
            expect(() => typer.isType('domelement', null)).toThrow('HTMLElement is not defined');
        });
    });

    describe('Function validation', () => {
        it('should validate functions', () => {
            const func = () => {};
            const namedFunc = function test() {};
            const arrowFunc = (x: number) => x * 2;

            expect(() => typer.isType('function', func)).not.toThrow();
            expect(() => typer.isType('f', namedFunc)).not.toThrow();
            expect(() => typer.isType('funct', arrowFunc)).not.toThrow();
        });

        it('should throw for non-functions', () => {
            expect(() => typer.isType('function', {})).toThrow('must be a function, is object');
            expect(() => typer.isType('function', 'test')).toThrow('must be a function, is string');
        });
    });

    describe('JSON validation', () => {
        it('should validate valid JSON strings', () => {
            const validJson = '{"key": "value"}';
            const validArrayJson = '[1, 2, 3]';
            const validStringJson = '"test"';
            const validNumberJson = '42';

            expect(() => typer.isType('json', validJson)).not.toThrow();
            expect(() => typer.isType('j', validArrayJson)).not.toThrow();
            expect(() => typer.isType('json', validStringJson)).not.toThrow();
            expect(() => typer.isType('json', validNumberJson)).not.toThrow();
        });

        it('should throw for invalid JSON strings', () => {
            expect(() => typer.isType('json', '{invalid json}')).toThrow('must be a valid JSON string');
            expect(() => typer.isType('json', 'undefined')).toThrow('must be a valid JSON string');
        });

        it('should throw for non-string input', () => {
            expect(() => typer.isType('json', {})).toThrow('must be a string');
            expect(() => typer.isType('json', 123)).toThrow('must be a string');
        });
    });

    describe('Map validation', () => {
        it('should validate Map objects', () => {
            const map = new Map();
            map.set('key', 'value');

            expect(() => typer.isType('map', map)).not.toThrow();
            expect(() => typer.isType('map', new Map())).not.toThrow();
        });

        it('should throw for non-Map objects', () => {
            expect(() => typer.isType('map', {})).toThrow('must be a Map');
            expect(() => typer.isType('map', [])).toThrow('must be a Map');
        });
    });

    describe('Null validation', () => {
        it('should validate null', () => {
            expect(() => typer.isType('null', null)).not.toThrow();
        });

        it('should throw for non-null values', () => {
            expect(() => typer.isType('null', undefined)).toThrow('must be null');
            expect(() => typer.isType('null', 0)).toThrow('must be null');
            expect(() => typer.isType('null', '')).toThrow('must be null');
        });
    });

    describe('Object validation', () => {
        it('should validate plain objects', () => {
            expect(() => typer.isType('object', {})).not.toThrow();
            expect(() => typer.isType('obj', { key: 'value' })).not.toThrow();
            expect(() => typer.isType('o', new Object())).not.toThrow();
        });

        it('should throw for arrays (not plain objects)', () => {
            expect(() => typer.isType('object', [])).toThrow('must be a non-array object, is array');
        });

        it('should throw for non-objects', () => {
            expect(() => typer.isType('object', 'string')).toThrow('must be a non-array object, is string');
            expect(() => typer.isType('object', 123)).toThrow('must be a non-array object, is number');
        });
    });

    describe('RegExp validation', () => {
        it('should validate RegExp objects', () => {
            expect(() => typer.isType('regex', /test/)).not.toThrow();
            expect(() => typer.isType('reg', new RegExp('test'))).not.toThrow();
            expect(() => typer.isType('regexp', /^[a-z]+$/i)).not.toThrow();
        });

        it('should throw for non-RegExp objects', () => {
            expect(() => typer.isType('regex', '/test/')).toThrow('must be a RegExp');
            expect(() => typer.isType('regex', {})).toThrow('must be a RegExp');
        });
    });

    describe('Set validation', () => {
        it('should validate Set objects', () => {
            const set = new Set([1, 2, 3]);
            
            expect(() => typer.isType('set', set)).not.toThrow();
            expect(() => typer.isType('set', new Set())).not.toThrow();
        });

        it('should throw for non-Set objects', () => {
            expect(() => typer.isType('set', [])).toThrow('must be a Set');
            expect(() => typer.isType('set', {})).toThrow('must be a Set');
        });
    });

    describe('Symbol validation', () => {
        it('should validate symbols', () => {
            const sym = Symbol('test');
            const globalSym = Symbol.for('global');

            expect(() => typer.isType('symbol', sym)).not.toThrow();
            expect(() => typer.isType('sym', globalSym)).not.toThrow();
        });

        it('should throw for non-symbols', () => {
            expect(() => typer.isType('symbol', 'symbol')).toThrow('must be a symbol, is string');
            expect(() => typer.isType('symbol', {})).toThrow('must be a symbol, is object');
        });
    });

    describe('Undefined validation', () => {
        it('should validate undefined', () => {
            expect(() => typer.isType('undefined', undefined)).not.toThrow();
            expect(() => typer.isType('u', undefined)).not.toThrow();
            expect(() => typer.isType('undef', undefined)).not.toThrow();
            expect(() => typer.isType('void', undefined)).not.toThrow();
        });

        it('should throw for non-undefined values', () => {
            expect(() => typer.isType('undefined', null)).toThrow('must be undefined, is object');
            expect(() => typer.isType('undefined', 0)).toThrow('must be undefined, is number');
        });
    });

    describe('Multiple type validation', () => {
        it('should validate multiple types with arrays', () => {
            expect(() => typer.isType(['string', 'number'], 'test')).not.toThrow();
            expect(() => typer.isType(['string', 'number'], 42)).not.toThrow();
        });

        it('should throw when none of multiple types match', () => {
            expect(() => typer.isType(['string', 'number'], true))
                .toThrow('None of the types matched');
        });
    });

    describe('Unknown type handling', () => {
        it('should throw for unknown types', () => {
            expect(() => typer.isType('unknowntype', 'test')).toThrow('Unknown type: unknowntype');
        });
    });
});