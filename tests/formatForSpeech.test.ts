/* Repository touch marker. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatForSpeech, formatRupees } from "../shared/formatForSpeech.ts";

test("rupee formatter switches from rupees to thousands, lakhs, and crores at exact thresholds", () => {
  assert.equal(formatRupees(0), "zero rupees");
  assert.equal(formatRupees(999), "999 rupees");
  assert.equal(formatRupees(999.5), "1000 rupees");
  assert.equal(formatRupees(1_000), "1 thousand rupees");
  assert.equal(formatRupees(12_650), "12.7 thousand rupees");
  assert.equal(formatRupees(100_000), "1 lakh rupees");
  assert.equal(formatRupees(4_816_276.13), "48.2 lakh rupees");
  assert.equal(formatRupees(9_999_999), "100 lakh rupees");
  assert.equal(formatRupees(10_000_000), "1 crore rupees");
  assert.equal(formatRupees(12_600_000), "1.26 crore rupees");
  assert.equal(formatRupees(13_640_000), "1.36 crore rupees");
  assert.equal(formatRupees(-12_600_000), "-1.26 crore rupees");
});

test("speech sanitizer converts Indian currency and removes dashboard-only notes", () => {
  const raw = "27 overdue invoices (₹48,16,276.13); 6 overdue purchase bills (₹9,34,682.95); 0 overdue statutory dues (₹0.00). Status comes from Nova’s fixed dataset date.";
  assert.equal(formatForSpeech(raw), "27 overdue invoices, 48.2 lakh rupees. 6 overdue purchase bills, 9.3 lakh rupees. 0 overdue statutory dues, zero rupees.");
  assert.equal(formatForSpeech("₹4816276.13 and ₹934682.95"), "48.2 lakh rupees and 9.3 lakh rupees");
  assert.equal(formatForSpeech("₹100000; ₹0; ₹99999; ₹1250.50"), "1 lakh rupees. zero rupees. 100 thousand rupees. 1.3 thousand rupees");
  assert.equal(formatForSpeech("Status comes from Nova's fixed dataset date. Balance (₹0.00)."), "Balance, zero rupees.");
  assert.equal(formatForSpeech("Refund ₹-500.25; change -₹1,00,000."), "Refund minus 500 rupees. change minus 1 lakh rupees.");
  assert.equal(formatForSpeech(formatForSpeech(raw)), formatForSpeech(raw));
  assert.doesNotMatch(formatForSpeech("₹ unknown (amount);"), /[₹();]/);
});

test("speech sanitizer upgrades raw crore amounts and existing 100-plus lakh phrases", () => {
  assert.equal(formatForSpeech("Cash is ₹1,26,45,000.00; opening ₹1,36,40,000."), "Cash is 1.26 crore rupees. opening 1.36 crore rupees.");
  assert.equal(formatForSpeech("126 lakh rupees, 126.4 lakhs and 136 lakh rupees"), "1.26 crore rupees, 1.26 crore and 1.36 crore rupees");
  assert.equal(formatForSpeech("99.9 lakh rupees; 100 lakh rupees"), "99.9 lakh rupees. 1 crore rupees");
  assert.equal(formatForSpeech("₹99,99,999 and 126 lakh rupees"), "100 lakh rupees and 1.26 crore rupees");
});
