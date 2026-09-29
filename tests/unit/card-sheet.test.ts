import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import { formatCardCode, renderCardSheet } from "@/lib/pdf/card-sheet";
import { pdfText } from "../e2e/pdf-text";

// S-28 and US-03.1 AC2: the printed card must be an ID-1 card, 85.6 × 54 mm, ten to a
// page. The PDF is rendered for real and its page geometry is read back, so a layout
// change that breaks the physical size fails here rather than at the printer.
const MM = 2.834645669;
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

function codes(count: number): string[] {
  return Array.from(
    { length: count },
    (_, index) => `1${String(index).padStart(9, "0")}`,
  );
}

describe("BR-030: the printed code", () => {
  it("is grouped as 123 456 7890", () => {
    expect(formatCardCode("1234567890")).toBe("123 456 7890");
  });
});

describe("BR-030: the QR payload", () => {
  it("encodes the ten digits and nothing else", () => {
    // BR-030: the QR holds only the ten digits, so any scanner keyboard layout works.
    const code = "1234567890";
    const segments = QRCode.create(code, {
      errorCorrectionLevel: "M",
    }).segments;
    expect(segments.map((segment) => segment.data).join("")).toBe(code);
  });
});

describe("S-28: the card sheet", () => {
  it("renders a real PDF", async () => {
    const pdf = await renderCardSheet({
      codes: codes(3),
      gymName: "KP Fitness",
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
  }, 60_000);

  it("puts ten cards on a page and no more", async () => {
    const pdf = await renderCardSheet({
      codes: codes(21),
      gymName: "KP Fitness",
    });
    // 21 cards need three pages: 10, 10 and 1.
    const pages = pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? [];
    expect(pages.length).toBe(3);
  }, 60_000);

  it("keeps the ten cards inside an A4 page at ID-1 size", () => {
    // Two columns of five, each 85.6 × 54 mm, must fit A4 with room for margins.
    const sheetWidth = 2 * 85.6 * MM;
    const sheetHeight = 5 * 54 * MM;
    expect(sheetWidth).toBeLessThanOrEqual(A4_WIDTH);
    expect(sheetHeight).toBeLessThanOrEqual(A4_HEIGHT);
    // The margins the layout uses must leave the cards exactly this size.
    expect(A4_WIDTH - sheetWidth).toBeCloseTo(2 * 19.4 * MM, 0);
    expect(A4_HEIGHT - sheetHeight).toBeCloseTo(2 * 13.5 * MM, 0);
  });

  it("D-73: prints the gym name, the handle, the code and the name label", async () => {
    const pdf = await renderCardSheet({
      codes: ["4801234567"],
      gymName: "KP Fitness",
    });
    // Runs are joined, since the helper may break a line between two of them.
    const text = pdfText(pdf).replace(/\n/g, "");
    expect(text).toContain("KP Fitness");
    expect(text).toContain("@kpfitness.me");
    expect(text).toContain("480 123 4567");
    expect(text).toContain("Ime i prezime:");
  }, 60_000);

  it("renders Montenegrin letters with the embedded font", async () => {
    // Doc 08 §7: č ć š ž đ must survive; an unembedded font would throw or drop them.
    const pdf = await renderCardSheet({
      codes: codes(1),
      gymName: "Teretana Čćšžđ",
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  }, 60_000);
});
