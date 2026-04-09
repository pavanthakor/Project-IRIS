import { describe, it, expect } from 'vitest';
import {
  validateIP,
  validateDomain,
  validateHash,
  validateEmail,
  sanitizeString,
} from '../utils/validators';

// ── sanitizeString ──────────────────────────────────────────────────────────
describe('sanitizeString', () => {
  it('strips HTML tags (keeps text content between tags)', () => {
    expect(sanitizeString('<b>8.8.8.8</b>')).toBe('8.8.8.8');
    // Tags are removed; inner text is preserved — subsequent IoC validators
    // then reject non-IP content like "alert(1)test".
    expect(sanitizeString('<script>alert(1)</script>test')).toBe('alert(1)test');
  });

  it('trims whitespace', () => {
    expect(sanitizeString('  8.8.8.8  ')).toBe('8.8.8.8');
  });

  it('throws on null bytes', () => {
    expect(() => sanitizeString('8.8\x008.8')).toThrow('null bytes');
  });
});

// ── validateIP ──────────────────────────────────────────────────────────────
describe('validateIP', () => {
  describe('valid public IPv4', () => {
    it.each([
      '8.8.8.8',
      '1.1.1.1',
      '203.0.113.1',
      '198.51.100.42',
    ])('accepts %s', (ip) => {
      expect(validateIP(ip).valid).toBe(true);
      expect(validateIP(ip).version).toBe(4);
    });
  });

  describe('private / reserved IPv4 → rejected', () => {
    it.each([
      ['10.0.0.1',       'Private (10/8)'],
      ['10.255.255.255',  'Private (10/8)'],
      ['172.16.0.1',     'Private (172.16/12)'],
      ['172.31.255.255', 'Private (172.16/12)'],
      ['192.168.1.1',    'Private (192.168/16)'],
      ['127.0.0.1',      'Loopback'],
      ['0.0.0.1',        'Current network'],
      ['169.254.0.1',    'Link-local'],
      ['224.0.0.1',      'Multicast'],
      ['255.255.255.255','Broadcast'],
    ])('rejects %s (%s)', (ip) => {
      const r = validateIP(ip);
      expect(r.valid).toBe(false);
      expect(r.isPrivate).toBe(true);
      expect(r.error).toMatch(/Private\/reserved/);
    });
  });

  describe('malformed IPv4', () => {
    it('rejects leading zeros', () => {
      expect(validateIP('08.08.08.08').valid).toBe(false);
      expect(validateIP('08.08.08.08').error).toMatch(/leading zeros/);
    });

    it('rejects octets > 255', () => {
      expect(validateIP('999.1.1.1').valid).toBe(false);
      expect(validateIP('999.1.1.1').error).toMatch(/out of range/);
      expect(validateIP('256.0.0.0').valid).toBe(false);
    });

    it('rejects wrong octet count', () => {
      expect(validateIP('8.8.8').valid).toBe(false);
      expect(validateIP('8.8.8.8.8').valid).toBe(false);
    });
  });

  describe('valid IPv6', () => {
    it.each([
      '2001:db8::1',
      '::1',
      '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
      'fe80::1',
      '::',
    ])('accepts %s', (ip) => {
      const r = validateIP(ip);
      expect(r.valid).toBe(true);
      expect(r.version).toBe(6);
    });
  });

  describe('malformed IPv6', () => {
    it.each([
      'gggg::1',
      ':::1',
      '2001::db8::1',
    ])('rejects %s', (ip) => {
      expect(validateIP(ip).valid).toBe(false);
    });
  });
});

// ── validateDomain ──────────────────────────────────────────────────────────
describe('validateDomain', () => {
  describe('valid domains', () => {
    it.each([
      ['example.com',        'example.com'],
      ['sub.example.co.uk',  'sub.example.co.uk'],
      ['xn--fiqz9s.com',     'xn--fiqz9s.com'],   // Punycode
      ['a-b.c',              'a-b.c'],
      ['Example.COM',        'example.com'],        // normalized to lowercase
      ['example.com.',       'example.com'],        // trailing dot stripped
    ])('accepts %s and normalizes to %s', (input, expected) => {
      const r = validateDomain(input);
      expect(r.valid).toBe(true);
      expect(r.normalized).toBe(expected);
    });
  });

  describe('invalid domains', () => {
    it('rejects bare TLDs', () => {
      expect(validateDomain('com').valid).toBe(false);
    });

    it('rejects domains > 253 chars', () => {
      const long = 'a'.repeat(64) + '.' + 'b'.repeat(64) + '.' + 'c'.repeat(64) + '.com';
      expect(validateDomain(long).valid).toBe(false);
    });

    it('rejects labels > 63 chars', () => {
      expect(validateDomain('a'.repeat(64) + '.com').valid).toBe(false);
    });

    it('rejects consecutive dots', () => {
      expect(validateDomain('example..com').valid).toBe(false);
    });

    it('rejects labels starting with hyphen', () => {
      expect(validateDomain('-bad.com').valid).toBe(false);
    });

    it('rejects labels ending with hyphen', () => {
      expect(validateDomain('bad-.com').valid).toBe(false);
      expect(validateDomain('example.com-').valid).toBe(false);
    });

    it('rejects leading dot', () => {
      expect(validateDomain('.com').valid).toBe(false);
    });
  });
});

// ── validateHash ────────────────────────────────────────────────────────────
describe('validateHash', () => {
  describe('valid hashes', () => {
    it('accepts MD5 (32 chars)', () => {
      const r = validateHash('d41d8cd98f00b204e9800998ecf8427e');
      expect(r.valid).toBe(true);
      expect(r.hashType).toBe('md5');
    });

    it('accepts SHA1 (40 chars)', () => {
      const r = validateHash('aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d');
      expect(r.valid).toBe(true);
      expect(r.hashType).toBe('sha1');
    });

    it('accepts SHA256 (64 chars)', () => {
      const r = validateHash('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
      expect(r.valid).toBe(true);
      expect(r.hashType).toBe('sha256');
    });

    it('accepts uppercase hex', () => {
      expect(validateHash('D41D8CD98F00B204E9800998ECF8427E').valid).toBe(true);
    });
  });

  describe('rejected hashes', () => {
    it('rejects wrong lengths', () => {
      expect(validateHash('d41d8cd98f00b204e9800998ecf8427').valid).toBe(false);  // 31
      expect(validateHash('d41d8cd98f00b204e9800998ecf8427ee').valid).toBe(false); // 33
    });

    it('rejects non-hex characters', () => {
      expect(validateHash('g41d8cd98f00b204e9800998ecf8427e').valid).toBe(false);
    });

    it('rejects all-zero hash', () => {
      const r = validateHash('0'.repeat(64));
      expect(r.valid).toBe(false);
      expect(r.error).toMatch(/All-zero/);
    });

    it('rejects all-F hash', () => {
      const r = validateHash('f'.repeat(64));
      expect(r.valid).toBe(false);
      expect(r.error).toMatch(/All-F/);
    });

    it('rejects hash with trailing space', () => {
      expect(validateHash('d41d8cd98f00b204e9800998ecf8427e ').valid).toBe(false);
    });
  });
});

// ── validateEmail ───────────────────────────────────────────────────────────
describe('validateEmail', () => {
  describe('valid emails', () => {
    it('accepts standard addresses', () => {
      expect(validateEmail('a@b.com').valid).toBe(true);
      expect(validateEmail('test.user+alias@gmail.co.uk').valid).toBe(true);
    });

    it('normalizes to lowercase', () => {
      const r = validateEmail('User@Gmail.COM');
      expect(r.valid).toBe(true);
      expect(r.normalized).toBe('user@gmail.com');
    });

    it('flags typo domains', () => {
      const r = validateEmail('test@gmial.com');
      expect(r.valid).toBe(true);
      expect(r.typoSuggestion).toBe('gmail.com');
    });

    it('returns no typoSuggestion for correct domains', () => {
      const r = validateEmail('test@gmail.com');
      expect(r.valid).toBe(true);
      expect(r.typoSuggestion).toBeUndefined();
    });
  });

  describe('invalid emails', () => {
    it('rejects missing @', () => {
      expect(validateEmail('no-at.com').valid).toBe(false);
    });

    it('rejects domain starting with dot', () => {
      expect(validateEmail('user@.com').valid).toBe(false);
    });

    it('rejects leading @', () => {
      expect(validateEmail('@domain.com').valid).toBe(false);
    });

    it('rejects domain ending with dot', () => {
      expect(validateEmail('user@domain.').valid).toBe(false);
    });

    it('rejects local part > 64 chars', () => {
      expect(validateEmail('a'.repeat(65) + '@gmail.com').valid).toBe(false);
    });

    it('rejects total length > 254 chars', () => {
      expect(validateEmail('a'.repeat(200) + '@' + 'b'.repeat(55) + '.com').valid).toBe(false);
    });
  });
});
