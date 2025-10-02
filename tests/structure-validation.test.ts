import { Typer } from '../src/Typer';

describe('Typer - Structure Validation', () => {
  let typer: Typer;

  beforeEach(() => {
    typer = new Typer();
  });

  describe('checkStructure', () => {
    describe('Basic structure validation', () => {
      test('should validate simple object structures', () => {
        const schema = {
          name: 'string',
          age: 'number',
          active: 'boolean'
        };

        const validData = {
          name: 'John',
          age: 30,
          active: true
        };

        const result = typer.checkStructure(schema, validData);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      test('should detect missing required fields', () => {
        const schema = {
          name: 'string',
          age: 'number'
        };

        const invalidData = {
          name: 'John'
          // missing age
        };

        const result = typer.checkStructure(schema, invalidData);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Missing required key "age"');
      });

      test('should detect wrong field types', () => {
        const schema = {
          name: 'string',
          age: 'number'
        };

        const invalidData = {
          name: 'John',
          age: '30' // should be number
        };

        const result = typer.checkStructure(schema, invalidData);
        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors.some(error => error.includes('age'))).toBe(true);
      });
    });

    describe('Optional fields', () => {
      test('should handle optional fields correctly', () => {
        const schema = {
          name: 'string',
          age: 'number',
          email: 'string?' // optional field
        };

        const validDataWithOptional = {
          name: 'John',
          age: 30,
          email: 'john@example.com'
        };

        const validDataWithoutOptional = {
          name: 'John',
          age: 30
        };

        const result1 = typer.checkStructure(schema, validDataWithOptional);
        expect(result1.isValid).toBe(true);
        expect(result1.errors).toHaveLength(0);

        const result2 = typer.checkStructure(schema, validDataWithoutOptional);
        expect(result2.isValid).toBe(true);
        expect(result2.errors).toHaveLength(0);
      });

      test('should validate optional field types when present', () => {
        const schema = {
          name: 'string',
          email: 'string?'
        };

        const invalidData = {
          name: 'John',
          email: 123 // wrong type for optional field
        };

        const result = typer.checkStructure(schema, invalidData);
        expect(result.isValid).toBe(false);
        expect(result.errors.some(error => error.includes('email'))).toBe(true);
      });
    });

    describe('Nested structures', () => {
      test('should validate nested object structures', () => {
        const schema = {
          user: {
            name: 'string',
            age: 'number'
          },
          settings: {
            theme: 'string',
            notifications: 'boolean'
          }
        };

        const validData = {
          user: {
            name: 'John',
            age: 30
          },
          settings: {
            theme: 'dark',
            notifications: true
          }
        };

        const result = typer.checkStructure(schema, validData);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      test('should detect errors in nested structures', () => {
        const schema = {
          user: {
            name: 'string',
            age: 'number'
          }
        };

        const invalidData = {
          user: {
            name: 'John',
            age: 'thirty' // wrong type
          }
        };

        const result = typer.checkStructure(schema, invalidData);
        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors.some(error => error.includes('user.age'))).toBe(true);
      });

      test('should handle missing nested objects', () => {
        const schema = {
          user: {
            name: 'string',
            age: 'number'
          }
        };

        const invalidData = {
          // missing user object
        };

        const result = typer.checkStructure(schema, invalidData);
        expect(result.isValid).toBe(false);
        expect(result.errors.some(error => error.includes('user'))).toBe(true);
      });
    });

    describe('Array structures', () => {
      test('should validate array fields', () => {
        const schema = {
          tags: 'array',
          scores: 'array'
        };

        const validData = {
          tags: ['javascript', 'typescript'],
          scores: [85, 92, 78]
        };

        const result = typer.checkStructure(schema, validData);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      test('should detect non-array values', () => {
        const schema = {
          tags: 'array'
        };

        const invalidData = {
          tags: 'not-an-array'
        };

        const result = typer.checkStructure(schema, invalidData);
        expect(result.isValid).toBe(false);
        expect(result.errors.some(error => error.includes('tags'))).toBe(true);
      });
    });

    describe('Strict mode', () => {
      test('should allow extra fields in non-strict mode (default)', () => {
        const schema = {
          name: 'string',
          age: 'number'
        };

        const dataWithExtraFields = {
          name: 'John',
          age: 30,
          extra: 'field',
          another: 'extra'
        };

        const result = typer.checkStructure(schema, dataWithExtraFields);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      test('should reject extra fields in strict mode', () => {
        const schema = {
          name: 'string',
          age: 'number'
        };

        const dataWithExtraFields = {
          name: 'John',
          age: 30,
          extra: 'field'
        };

        const result = typer.checkStructure(schema, dataWithExtraFields, '', true); // strict mode
        expect(result.isValid).toBe(false);
        expect(result.errors.some(error => error.includes('extra'))).toBe(true);
      });
    });

    describe('Complex real-world examples', () => {
      test('should validate user profile structure', () => {
        const userProfileSchema = {
          id: 'number',
          username: 'string',
          email: 'string',
          profile: {
            firstName: 'string',
            lastName: 'string',
            age: 'number?',
            bio: 'string?'
          },
          settings: {
            theme: 'string',
            notifications: {
              email: 'boolean',
              push: 'boolean',
              sms: 'boolean?'
            }
          },
          tags: 'array',
          isActive: 'boolean'
        };

        const validUserData = {
          id: 1,
          username: 'johndoe',
          email: 'john@example.com',
          profile: {
            firstName: 'John',
            lastName: 'Doe',
            age: 30,
            bio: 'Software developer'
          },
          settings: {
            theme: 'dark',
            notifications: {
              email: true,
              push: false,
              sms: true
            }
          },
          tags: ['developer', 'javascript', 'react'],
          isActive: true
        };

        const result = typer.checkStructure(userProfileSchema, validUserData);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      test('should validate API response structure', () => {
        const apiResponseSchema = {
          status: 'string',
          data: {
            users: 'array',
            total: 'number',
            page: 'number'
          },
          meta: {
            timestamp: 'string',
            version: 'string?'
          }
        };

        const validApiResponse = {
          status: 'success',
          data: {
            users: [
              { id: 1, name: 'John' },
              { id: 2, name: 'Jane' }
            ],
            total: 2,
            page: 1
          },
          meta: {
            timestamp: '2023-01-01T00:00:00Z',
            version: 'v1.0'
          }
        };

        const result = typer.checkStructure(apiResponseSchema, validApiResponse);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    describe('Error reporting', () => {
      test('should provide detailed error messages', () => {
        const schema = {
          user: {
            name: 'string',
            age: 'number'
          },
          tags: 'array'
        };

        const invalidData = {
          user: {
            name: 123, // wrong type
            // missing age
          },
          tags: 'not-array' // wrong type
        };

        const result = typer.checkStructure(schema, invalidData);
        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(2);
        
        // Should contain specific error paths
        const errorString = result.errors.join(' ');
        expect(errorString).toContain('user');
        expect(errorString).toContain('tags');
      });

      test('should handle null and undefined values appropriately', () => {
        const schema = {
          name: 'string',
          age: 'number?'
        };

        const nullData = {
          name: null,
          age: undefined
        };

        const result = typer.checkStructure(schema, nullData);
        expect(result.isValid).toBe(false);
        expect(result.errors.some(error => error.includes('name'))).toBe(true);
        // age should be OK since it's optional
      });
    });
  });
});