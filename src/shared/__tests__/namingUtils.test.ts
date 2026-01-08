/**
 * Tests for naming convention utilities
 */

import {
  isPascalCase,
  isSnakeCase,
  isScreamingSnakeCase,
  toPascalCase,
  toSnakeCase,
  toScreamingSnakeCase,
  isValidNaming,
  getConventionName,
} from '../namingUtils';

describe('namingUtils', () => {
  describe('isPascalCase', () => {
    it('should return true for valid PascalCase', () => {
      expect(isPascalCase('MyMessage')).toBe(true);
      expect(isPascalCase('User')).toBe(true);
      expect(isPascalCase('UserProfile')).toBe(true);
      expect(isPascalCase('HTTPServer')).toBe(true);
      expect(isPascalCase('User123')).toBe(true);
    });

    it('should return false for invalid PascalCase', () => {
      expect(isPascalCase('myMessage')).toBe(false);
      expect(isPascalCase('my_message')).toBe(false);
      expect(isPascalCase('MY_MESSAGE')).toBe(false);
      expect(isPascalCase('123User')).toBe(false);
      expect(isPascalCase('')).toBe(false);
    });
  });

  describe('isSnakeCase', () => {
    it('should return true for valid snake_case', () => {
      expect(isSnakeCase('user_name')).toBe(true);
      expect(isSnakeCase('user')).toBe(true);
      expect(isSnakeCase('user_profile_id')).toBe(true);
      expect(isSnakeCase('user123')).toBe(true);
      expect(isSnakeCase('user_123')).toBe(true);
    });

    it('should return false for invalid snake_case', () => {
      expect(isSnakeCase('UserName')).toBe(false);
      expect(isSnakeCase('userName')).toBe(false);
      expect(isSnakeCase('USER_NAME')).toBe(false);
      expect(isSnakeCase('_user')).toBe(false);
      expect(isSnakeCase('123user')).toBe(false);
      expect(isSnakeCase('')).toBe(false);
    });
  });

  describe('isScreamingSnakeCase', () => {
    it('should return true for valid SCREAMING_SNAKE_CASE', () => {
      expect(isScreamingSnakeCase('STATUS_OK')).toBe(true);
      expect(isScreamingSnakeCase('STATUS')).toBe(true);
      expect(isScreamingSnakeCase('USER_PROFILE_STATUS')).toBe(true);
      expect(isScreamingSnakeCase('USER123')).toBe(true);
      expect(isScreamingSnakeCase('USER_123')).toBe(true);
      expect(isScreamingSnakeCase('A')).toBe(true);
    });

    it('should return false for invalid SCREAMING_SNAKE_CASE', () => {
      expect(isScreamingSnakeCase('status_ok')).toBe(false);
      expect(isScreamingSnakeCase('StatusOk')).toBe(false);
      expect(isScreamingSnakeCase('statusOk')).toBe(false);
      expect(isScreamingSnakeCase('_STATUS')).toBe(false);
      expect(isScreamingSnakeCase('123STATUS')).toBe(false);
      expect(isScreamingSnakeCase('')).toBe(false);
    });
  });

  describe('toPascalCase', () => {
    it('should convert snake_case to PascalCase', () => {
      expect(toPascalCase('user_name')).toBe('UserName');
      expect(toPascalCase('user_profile_id')).toBe('UserProfileId');
      expect(toPascalCase('my_message')).toBe('MyMessage');
    });

    it('should convert camelCase to PascalCase', () => {
      expect(toPascalCase('userName')).toBe('UserName');
      expect(toPascalCase('userProfileId')).toBe('UserProfileId');
    });

    it('should keep PascalCase unchanged', () => {
      expect(toPascalCase('UserName')).toBe('UserName');
      expect(toPascalCase('User')).toBe('User');
    });

    it('should handle single letter', () => {
      expect(toPascalCase('a')).toBe('A');
    });

    it('should handle empty string', () => {
      expect(toPascalCase('')).toBe('');
    });
  });

  describe('toSnakeCase', () => {
    it('should convert PascalCase to snake_case', () => {
      expect(toSnakeCase('UserName')).toBe('user_name');
      expect(toSnakeCase('UserProfileId')).toBe('user_profile_id');
      expect(toSnakeCase('MyMessage')).toBe('my_message');
    });

    it('should convert camelCase to snake_case', () => {
      expect(toSnakeCase('userName')).toBe('user_name');
      expect(toSnakeCase('userProfileId')).toBe('user_profile_id');
    });

    it('should keep snake_case unchanged', () => {
      expect(toSnakeCase('user_name')).toBe('user_name');
    });

    it('should handle single letter', () => {
      expect(toSnakeCase('A')).toBe('a');
      expect(toSnakeCase('a')).toBe('a');
    });

    it('should handle empty string', () => {
      expect(toSnakeCase('')).toBe('');
    });
  });

  describe('toScreamingSnakeCase', () => {
    it('should convert PascalCase to SCREAMING_SNAKE_CASE', () => {
      expect(toScreamingSnakeCase('StatusOk')).toBe('STATUS_OK');
      expect(toScreamingSnakeCase('UserProfileStatus')).toBe('USER_PROFILE_STATUS');
    });

    it('should convert snake_case to SCREAMING_SNAKE_CASE', () => {
      expect(toScreamingSnakeCase('status_ok')).toBe('STATUS_OK');
    });

    it('should convert camelCase to SCREAMING_SNAKE_CASE', () => {
      expect(toScreamingSnakeCase('statusOk')).toBe('STATUS_OK');
    });

    it('should handle single letter', () => {
      expect(toScreamingSnakeCase('A')).toBe('A');
      expect(toScreamingSnakeCase('a')).toBe('A');
    });

    it('should handle empty string', () => {
      expect(toScreamingSnakeCase('')).toBe('');
    });
  });

  describe('isValidNaming', () => {
    describe('PascalCase elements', () => {
      it('should validate message names', () => {
        expect(isValidNaming('MyMessage', 'message')).toBe(true);
        expect(isValidNaming('my_message', 'message')).toBe(false);
      });

      it('should validate enum names', () => {
        expect(isValidNaming('Status', 'enum')).toBe(true);
        expect(isValidNaming('status', 'enum')).toBe(false);
      });

      it('should validate service names', () => {
        expect(isValidNaming('UserService', 'service')).toBe(true);
        expect(isValidNaming('user_service', 'service')).toBe(false);
      });

      it('should validate rpc names', () => {
        expect(isValidNaming('GetUser', 'rpc')).toBe(true);
        expect(isValidNaming('get_user', 'rpc')).toBe(false);
      });

      it('should validate group names', () => {
        expect(isValidNaming('MyGroup', 'group')).toBe(true);
        expect(isValidNaming('my_group', 'group')).toBe(false);
      });
    });

    describe('snake_case elements', () => {
      it('should validate field names', () => {
        expect(isValidNaming('user_name', 'field')).toBe(true);
        expect(isValidNaming('UserName', 'field')).toBe(false);
      });

      it('should validate oneof names', () => {
        expect(isValidNaming('my_oneof', 'oneof')).toBe(true);
        expect(isValidNaming('MyOneof', 'oneof')).toBe(false);
      });
    });

    describe('SCREAMING_SNAKE_CASE elements', () => {
      it('should validate enum value names', () => {
        expect(isValidNaming('STATUS_OK', 'enumValue')).toBe(true);
        expect(isValidNaming('status_ok', 'enumValue')).toBe(false);
      });
    });

    describe('unknown element types', () => {
      it('should return true for unknown element types', () => {
        // @ts-expect-error - Testing unknown element type
        expect(isValidNaming('anything', 'unknown')).toBe(true);
      });
    });
  });

  describe('getConventionName', () => {
    it('should return PascalCase for message', () => {
      expect(getConventionName('message')).toBe('PascalCase');
    });

    it('should return PascalCase for enum', () => {
      expect(getConventionName('enum')).toBe('PascalCase');
    });

    it('should return PascalCase for service', () => {
      expect(getConventionName('service')).toBe('PascalCase');
    });

    it('should return PascalCase for rpc', () => {
      expect(getConventionName('rpc')).toBe('PascalCase');
    });

    it('should return PascalCase for group', () => {
      expect(getConventionName('group')).toBe('PascalCase');
    });

    it('should return snake_case for field', () => {
      expect(getConventionName('field')).toBe('snake_case');
    });

    it('should return snake_case for oneof', () => {
      expect(getConventionName('oneof')).toBe('snake_case');
    });

    it('should return SCREAMING_SNAKE_CASE for enumValue', () => {
      expect(getConventionName('enumValue')).toBe('SCREAMING_SNAKE_CASE');
    });

    it('should return unknown for unknown element types', () => {
      // @ts-expect-error - Testing unknown element type
      expect(getConventionName('unknown')).toBe('unknown');
    });
  });
});
