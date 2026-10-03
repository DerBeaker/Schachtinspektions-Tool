// Bluetooth-Laser: Dekodierung der Messpakete (Leica DISTO, Bosch GLM) und Umrechnung für die Maßfelder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leicaWert, boschWert, feldWert, LEICA, BOSCH } from '../app/js/core/laser.js';

const hex = (s) => new Uint8Array(s.match(/../g).map((x) => parseInt(x, 16)));
const float = (v) => { const d = new DataView(new ArrayBuffer(4)); d.setFloat32(0, v, true); return new Uint8Array(d.buffer); };

test('Leica DISTO: float32 little-endian in Metern, auch vorne im längeren Messwertpaket', () => {
  assert.equal(leicaWert(float(2.345)), 2.345);
  assert.equal(leicaWert(new DataView(float(1.5).buffer)), 1.5);
  const paket = new Uint8Array(20); paket.set(float(0.873)); paket[4] = 0x55;
  assert.equal(leicaWert(paket), 0.873);
  assert.equal(leicaWert(float(0)), null, 'kein Messwert');
  assert.equal(leicaWert(float(NaN)), null);
  assert.equal(leicaWert(new Uint8Array(2)), null);
  assert.match(LEICA.service, /^3ab10100-f831-4395-b29d-570977d5bf94$/);
});

test('Bosch GLM: Messpaket C0 55 10 …, Distanz ab Byte 7', () => {
  // Pakete eines GLM aus dem B4X-Forum (Werte laut Display)
  assert.equal(boschWert(hex('C0551006083C0815FBBF3F0000000000000000A0')).toFixed(3), '1.500');
  assert.equal(boschWert(hex('C0551004086F08DA1BDC3F0000000000000000CC')).toFixed(3), '1.720');
  assert.equal(boschWert(hex('C0551006080208E09CE93F000000000000000006')).toFixed(3), '1.825');
  assert.equal(boschWert(hex('C055100608420831080040000000000000000068')).toFixed(3), '2.000');
  assert.equal(boschWert(hex('C0550201001A')), null, 'Quittung, kein Messwert');
  assert.equal(boschWert(hex('C056100608420831080040000000000000000068')), null, 'anderer Befehl');
  assert.equal(BOSCH.syncAn.length, 6);
});

test('Messwert in die Einheit des Feldes', () => {
  assert.equal(feldWert(2.3456, 'm'), '2,346');
  assert.equal(feldWert(2.3456, 'mm'), '2346');
  assert.equal(feldWert(0.1234, 'cm'), '12,3');
  assert.equal(feldWert(1.5), '1,500');
});
