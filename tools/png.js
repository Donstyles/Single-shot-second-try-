// tools/png.js — indexed (colour-type 3) PNG encode/decode.
//
// This is the size budget. Raw palette-index arrays are enormous: in the v1 build ONE creature
// stored as JSON number arrays was 273 KB, which put ~21 actors at roughly 5.7 MB in a file meant
// to load instantly on a phone. An indexed PNG of the same data is 4-8x smaller AND the browser
// decodes it for free, so it costs no runtime code either.
//
// Encoding is fixed BEFORE any bulk render run, not after. Discovering the payload problem on a
// phone at the end costs the whole art pass.

const zlib = require('zlib');

// ---------------------------------------------------------------- crc32
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Encode palette indices as an indexed PNG.
 * @param {Uint8Array} indices  w*h palette indices
 * @param {number} w
 * @param {number} h
 * @param {Uint8Array} pal      256*3 RGB
 * @param {number} transparentIndex  index rendered fully transparent (0 for this project)
 */
function encodeIndexed(indices, w, h, pal, transparentIndex) {
  const ti = transparentIndex === undefined ? 0 : transparentIndex;

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 3;    // colour type: indexed
  ihdr[10] = 0;   // deflate
  ihdr[11] = 0;   // adaptive filtering
  ihdr[12] = 0;   // no interlace

  const plte = Buffer.from(pal.buffer ? pal : Uint8Array.from(pal));

  // tRNS only needs entries up to the transparent index; everything after is implicitly opaque.
  const trns = Buffer.alloc(ti + 1, 255);
  trns[ti] = 0;

  // Scanlines with per-row filter byte. Filter 0 (None) is right for indexed data: the "gradient"
  // a Sub/Up filter exploits does not exist in index space, where neighbouring indices are
  // categorical, and filtering can actively hurt the deflate ratio.
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w + 1)] = 0;
    for (let x = 0; x < w; x++) raw[y * (w + 1) + 1 + x] = indices[y * w + x];
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    SIG,
    chunk('IHDR', ihdr),
    chunk('PLTE', plte),
    chunk('tRNS', trns),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Decode an indexed PNG produced by encodeIndexed. Used by the tests to prove a round trip: a
// sprite that does not survive encode->decode byte-identically is a corrupted asset, and the
// corruption would only show up as "that sprite looks wrong" much later.
function decodeIndexed(buf) {
  if (!buf.slice(0, 8).equals(SIG)) throw new Error('not a PNG');
  let off = 8, w = 0, h = 0, bitDepth = 0, colourType = 0;
  const idatParts = [];
  let pal = null;

  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.slice(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colourType = data[9];
    } else if (type === 'PLTE') {
      pal = Uint8Array.from(data);
    } else if (type === 'IDAT') {
      idatParts.push(data);
    } else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (colourType !== 3 || bitDepth !== 8) throw new Error('not an 8-bit indexed PNG');

  const raw = zlib.inflateSync(Buffer.concat(idatParts));
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (w + 1)];
    if (filter !== 0) throw new Error('unexpected PNG filter ' + filter + ' on row ' + y);
    for (let x = 0; x < w; x++) out[y * w + x] = raw[y * (w + 1) + 1 + x];
  }
  return { w, h, indices: out, pal };
}

// Run-length encode indices, for comparison against PNG. Kept because it is the obvious
// alternative and the choice between them should be a measurement, not a preference.
function rle(indices) {
  const out = [];
  let i = 0;
  while (i < indices.length) {
    const v = indices[i];
    let n = 1;
    while (i + n < indices.length && indices[i + n] === v && n < 255) n++;
    out.push(n, v);
    i += n;
  }
  return Buffer.from(out);
}

module.exports = { encodeIndexed, decodeIndexed, rle, crc32 };
