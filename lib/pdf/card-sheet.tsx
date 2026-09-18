/* eslint-disable jsx-a11y/alt-text -- Image here is the @react-pdf/renderer
   primitive that draws into a PDF, not an HTML img; a PDF image has no alt text. */
import { resolve } from "node:path";
import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import QRCode from "qrcode";
import { me } from "@/lib/i18n/me";

/**
 * S-28 card sheet: A4 portrait, ten cards per page in two columns of five, each
 * 85.6 × 54 mm — the ID-1 size — with thin grey cut lines.
 *
 * Doc 08 §7 asks for an embedded font with full Latin Extended support so č ć š ž đ
 * render; the ten digits use the built-in Courier, which is the monospace S-28 wants.
 */
Font.register({
  family: "NotoSans",
  src: resolve(process.cwd(), "lib/pdf/fonts/NotoSans-Regular.ttf"),
});

const MM = 2.834645669; // 1 mm in PDF points
const CARD_WIDTH = 85.6 * MM;
const CARD_HEIGHT = 54 * MM;
const QR_SIZE = 30 * MM;

const styles = StyleSheet.create({
  page: {
    fontFamily: "NotoSans",
    paddingVertical: 13.5 * MM,
    paddingHorizontal: 19.4 * MM,
  },
  row: { flexDirection: "row" },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderWidth: 0.4,
    borderColor: "#c8c8c8", // thin grey cut lines
    borderStyle: "solid",
    padding: 4 * MM,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  left: { flex: 1, justifyContent: "space-between", paddingRight: 3 * MM },
  brand: { flexDirection: "row", alignItems: "center", gap: 2 * MM },
  logo: { width: 9 * MM, height: 9 * MM, objectFit: "contain" },
  gymName: { fontSize: 11 },
  nameLabel: { fontSize: 8, color: "#444444", marginBottom: 1.5 * MM },
  nameLine: {
    width: 50 * MM,
    borderBottomWidth: 0.5,
    borderBottomColor: "#666666",
  },
  right: { alignItems: "center" },
  qr: { width: QR_SIZE, height: QR_SIZE },
  code: { fontFamily: "Courier", fontSize: 12, marginTop: 1.5 * MM },
});

/** BR-030 display grouping: 123 456 7890. */
export function formatCardCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3, 6)} ${code.slice(6)}`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += size)
    pages.push(items.slice(index, index + size));
  return pages;
}

type CardData = { code: string; qr: string };

function CardCell({
  card,
  gymName,
  logo,
}: {
  card: CardData;
  gymName: string;
  logo?: string;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.left}>
        <View style={styles.brand}>
          {logo ? <Image style={styles.logo} src={logo} /> : null}
          <Text style={styles.gymName}>{gymName}</Text>
        </View>
        <View>
          <Text style={styles.nameLabel}>{me.cards.nameLabel}</Text>
          <View style={styles.nameLine} />
        </View>
      </View>
      <View style={styles.right}>
        <Image style={styles.qr} src={card.qr} />
        <Text style={styles.code}>{formatCardCode(card.code)}</Text>
      </View>
    </View>
  );
}

export async function renderCardSheet({
  codes,
  gymName,
  logo,
}: {
  codes: string[];
  gymName: string;
  logo?: string;
}): Promise<Buffer> {
  // Doc 08 §7: error correction M with a quiet zone of at least two modules. The PNG
  // is rendered large enough that 30 mm of paper still holds crisp modules.
  const cards: CardData[] = await Promise.all(
    codes.map(async (code) => ({
      code,
      qr: await QRCode.toDataURL(code, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 600,
      }),
    })),
  );

  return renderToBuffer(
    <Document title={me.cards.pdfTitle}>
      {chunk(cards, 10).map((pageCards, pageIndex) => (
        <Page key={pageIndex} size="A4" style={styles.page}>
          {chunk(pageCards, 2).map((rowCards, rowIndex) => (
            <View key={rowIndex} style={styles.row}>
              {rowCards.map((card) => (
                <CardCell
                  key={card.code}
                  card={card}
                  gymName={gymName}
                  logo={logo}
                />
              ))}
            </View>
          ))}
        </Page>
      ))}
    </Document>,
  );
}
