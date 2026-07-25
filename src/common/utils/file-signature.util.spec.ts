import { detectLabResultFileType, isValidLabResultFile } from './file-signature.util';

describe('file-signature.util', () => {
  const pdfBuffer = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from('rest of file')]);
  const pngBuffer = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from('rest of file'),
  ]);
  const jpegBuffer = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from('rest of file')]);
  const scriptBuffer = Buffer.from('#!/bin/sh\nrm -rf /\n');

  it('detects a real PDF by magic bytes', () => {
    expect(detectLabResultFileType(pdfBuffer)).toBe('application/pdf');
  });

  it('detects a real PNG by magic bytes', () => {
    expect(detectLabResultFileType(pngBuffer)).toBe('image/png');
  });

  it('detects a real JPEG by magic bytes', () => {
    expect(detectLabResultFileType(jpegBuffer)).toBe('image/jpeg');
  });

  it('returns null for non-matching content', () => {
    expect(detectLabResultFileType(scriptBuffer)).toBeNull();
  });

  it('accepts a file whose mimetype matches its real content', () => {
    expect(isValidLabResultFile('application/pdf', pdfBuffer)).toBe(true);
  });

  it('rejects a script disguised with a spoofed PDF mimetype', () => {
    expect(isValidLabResultFile('application/pdf', scriptBuffer)).toBe(false);
  });

  it('rejects a mimetype that is not in the allowed list even if content is unchecked', () => {
    expect(isValidLabResultFile('text/plain', scriptBuffer)).toBe(false);
  });
});
