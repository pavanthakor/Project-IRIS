import { IoCType } from '../types';

const BRAND_KEYWORDS = [
  'paypal', 'amazon', 'microsoft', 'google', 'apple', 'facebook', 'netflix',
  'instagram', 'twitter', 'linkedin', 'dropbox', 'adobe', 'fedex', 'dhl',
  'ups', 'usps', 'irs', 'bank', 'chase', 'wellsfargo', 'citibank', 'secure',
  'login', 'account', 'verify', 'update', 'confirm', 'support', 'service'
];

const SUSPICIOUS_TLDS = ['.tk', '.ml', '.ga', '.cf', '.gq', '.xyz', '.top', '.work', '.click'];

const SUSPICIOUS_KEYWORDS = [
  'secure-login', 'verify-account', 'update-payment', 'confirm-identity',
  'urgent', 'suspended', 'locked', 'expired', 'invoice', 'billing'
];

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0]![j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i]![j] = matrix[i - 1]![j - 1]!;
      } else {
        matrix[i]![j] = Math.min(
          matrix[i - 1]![j - 1]! + 1,
          matrix[i]![j - 1]! + 1,
          matrix[i - 1]![j]! + 1
        );
      }
    }
  }
  return matrix[b.length]![a.length]!;
}

function checkTyposquat(domain: string): { isTyposquat: boolean; brand?: string; confidence: number } {
  const domainLower = domain.toLowerCase();
  
  for (const brand of BRAND_KEYWORDS) {
    if (domainLower.includes(brand)) {
      const distance = levenshteinDistance(domainLower.replace(/[.-]/g, ''), brand);
      if (distance <= 2 && distance > 0) {
        return { isTyposquat: true, brand, confidence: 85 };
      }
      
      // Check for character substitution (1 -> l, 0 -> o, etc.)
      const hasSubstitution = /paypa1|g00gle|micr0soft|amaz0n/.test(domainLower);
      if (hasSubstitution) {
        return { isTyposquat: true, brand, confidence: 90 };
      }
    }
  }
  
  return { isTyposquat: false, confidence: 0 };
}

function checkSuspiciousDomain(domain: string): { isSuspicious: boolean; reasons: string[]; confidence: number } {
  const reasons: string[] = [];
  let confidence = 0;
  
  const domainLower = domain.toLowerCase();
  
  // Check for suspicious TLD
  if (SUSPICIOUS_TLDS.some(tld => domainLower.endsWith(tld))) {
    reasons.push('Suspicious TLD');
    confidence += 30;
  }
  
  // Check for suspicious keyword combinations
  const suspiciousMatches = SUSPICIOUS_KEYWORDS.filter(kw => domainLower.includes(kw));
  if (suspiciousMatches.length > 0) {
    reasons.push(`Suspicious keywords: ${suspiciousMatches.join(', ')}`);
    confidence += suspiciousMatches.length * 20;
  }
  
  // Check for excessive hyphens
  const hyphenCount = (domain.match(/-/g) || []).length;
  if (hyphenCount >= 3) {
    reasons.push('Excessive hyphens');
    confidence += 25;
  }
  
  // Check for mixed brand keywords
  const brandMatches = BRAND_KEYWORDS.filter(kw => domainLower.includes(kw));
  if (brandMatches.length >= 2) {
    reasons.push('Multiple brand keywords');
    confidence += 40;
  }
  
  return { isSuspicious: reasons.length > 0, reasons, confidence: Math.min(confidence, 95) };
}

function checkSuspiciousEmail(email: string): { isSuspicious: boolean; reasons: string[]; confidence: number } {
  const reasons: string[] = [];
  let confidence = 0;
  
  const parts = email.toLowerCase().split('@');
  const localPart = parts[0] || '';
  const domain = parts[1];
  if (!domain) return { isSuspicious: false, reasons: [], confidence: 0 };
  
  // Check for typosquat in domain
  const typosquat = checkTyposquat(domain);
  if (typosquat.isTyposquat) {
    reasons.push(`Typosquat of ${typosquat.brand}`);
    confidence += typosquat.confidence;
  }
  
  // Check for suspicious local part
  if (/invoice|billing|payment|urgent|verify|confirm|support|admin|security/.test(localPart)) {
    reasons.push('Suspicious sender name');
    confidence += 30;
  }
  
  // Check domain
  const domainCheck = checkSuspiciousDomain(domain);
  if (domainCheck.isSuspicious) {
    reasons.push(...domainCheck.reasons);
    confidence = Math.max(confidence, domainCheck.confidence);
  }
  
  return { isSuspicious: reasons.length > 0, reasons, confidence: Math.min(confidence, 95) };
}

export function analyzeHeuristics(ioc: string, type: IoCType) {
  if (type === 'domain') {
    const typosquat = checkTyposquat(ioc);
    const suspicious = checkSuspiciousDomain(ioc);
    
    if (typosquat.isTyposquat || suspicious.isSuspicious) {
      return {
        detected: true,
        confidence: Math.max(typosquat.confidence, suspicious.confidence),
        reasons: [
          ...(typosquat.isTyposquat ? [`Typosquat of ${typosquat.brand}`] : []),
          ...suspicious.reasons
        ],
        tags: ['typosquatting', 'phishing', 'brand-abuse'],
        mitreTechniques: ['T1566.002'] // Phishing: Spearphishing Link
      };
    }
  }
  
  if (type === 'email') {
    const result = checkSuspiciousEmail(ioc);
    if (result.isSuspicious) {
      return {
        detected: true,
        confidence: result.confidence,
        reasons: result.reasons,
        tags: ['phishing', 'typosquatting', 'brand-abuse'],
        mitreTechniques: ['T1566.001'] // Phishing: Spearphishing Attachment
      };
    }
  }
  
  return { detected: false, confidence: 0, reasons: [], tags: [], mitreTechniques: [] };
}
