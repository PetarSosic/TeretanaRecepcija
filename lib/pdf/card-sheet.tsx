/* eslint-disable jsx-a11y/alt-text -- Image here is the @react-pdf/renderer
   primitive that draws into a PDF, not an HTML img; a PDF image has no alt text. */
import { resolve } from "node:path";
import {
  ClipPath,
  Defs,
  Document,
  Font,
  G,
  Image,
  Line,
  LinearGradient,
  Page,
  Path,
  Rect,
  Stop,
  StyleSheet,
  Svg,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import QRCode from "qrcode";
import {
  KP_MARK_HEIGHT,
  KP_MARK_PATH,
  KP_MARK_VIEWBOX,
  KP_MARK_WIDTH,
} from "@/lib/brand";
import { me } from "@/lib/i18n/me";

/**
 * S-28 card sheet: A4 portrait, ten cards per page in two columns of five, each
 * 85.6 × 54 mm — the ID-1 size — with thin grey cut lines.
 *
 * D-71 gives the card the gym's look: a cream card inside a bronze frame with soft
 * waves, the KP mark beside the gym name and handle, the QR code on the right and the
 * name line along the bottom. Doc 08 §7 asks for embedded fonts with full Latin
 * Extended support so č ć š ž đ render: EB Garamond for the gym name and the name
 * label, Noto Sans for the handle. The ten digits use the built-in Courier, which is
 * the monospace S-28 wants.
 */
Font.register({
  family: "NotoSans",
  src: resolve(process.cwd(), "lib/pdf/fonts/NotoSans-Regular.ttf"),
});
Font.register({
  family: "EBGaramond",
  src: resolve(process.cwd(), "lib/pdf/fonts/EBGaramond-Medium.ttf"),
});

const MM = 2.834645669; // 1 mm in PDF points

// The card in millimetres; the SVG layers draw in a millimetre viewBox.
const CARD_WIDTH = 85.6;
const CARD_HEIGHT = 54;
const QR_SIZE = 30;
const QR_TOP = 6;
const EDGE_LEFT = 5; // content inset from the cut line
const EDGE_RIGHT = 5.2;
const FRAME_INSET = 1.3; // the printed frame sits inside the cut lines
const FRAME_RADIUS = 3.2;
const MARK_HEIGHT = 9.4;
const MARK_WIDTH = (MARK_HEIGHT * KP_MARK_WIDTH) / KP_MARK_HEIGHT;

const COLORS = {
  cut: "#c8c8c8",
  frame: "#b39a85",
  paperLight: "#fcfaf7",
  paperDark: "#f1e6da",
  wave: "#e6d6c4",
  ink: "#3a2418",
  muted: "#9a8b80",
  qrDark: "#2b1b12",
  qrLight: "#fffdf9",
};

const styles = StyleSheet.create({
  page: {
    paddingVertical: 13.5 * MM,
    paddingHorizontal: 19.4 * MM,
  },
  sheet: { position: "relative" },
  cutLines: { position: "absolute", top: -0.5 * MM, left: -0.5 * MM },
  row: { flexDirection: "row" },
  card: {
    position: "relative",
    width: CARD_WIDTH * MM,
    height: CARD_HEIGHT * MM,
  },
  background: { position: "absolute", top: 0, left: 0 },
  brand: {
    position: "absolute",
    top: 10 * MM,
    left: EDGE_LEFT * MM,
    width: (CARD_WIDTH - EDGE_RIGHT - QR_SIZE - EDGE_LEFT - 2.5) * MM,
    flexDirection: "row",
    alignItems: "center",
  },
  logo: {
    width: MARK_WIDTH * MM,
    height: MARK_HEIGHT * MM,
    objectFit: "contain",
  },
  divider: {
    width: 0.5,
    height: 11 * MM,
    marginHorizontal: 2.7 * MM,
    backgroundColor: COLORS.frame,
  },
  brandText: { flex: 1 },
  gymName: {
    fontFamily: "EBGaramond",
    fontSize: 14.5,
    lineHeight: 1.1,
    color: COLORS.ink,
  },
  handle: {
    fontFamily: "NotoSans",
    fontSize: 6.5,
    marginTop: 0.6 * MM,
    color: COLORS.muted,
  },
  qrBox: {
    position: "absolute",
    top: QR_TOP * MM,
    left: (CARD_WIDTH - EDGE_RIGHT - QR_SIZE) * MM,
    alignItems: "center",
  },
  qrFrame: { borderWidth: 0.5, borderColor: COLORS.frame },
  qr: { width: QR_SIZE * MM, height: QR_SIZE * MM },
  code: {
    fontFamily: "Courier",
    fontSize: 12,
    marginTop: 1.2 * MM,
    color: COLORS.ink,
  },
  nameRow: {
    position: "absolute",
    left: EDGE_LEFT * MM,
    right: EDGE_RIGHT * MM,
    bottom: 6 * MM,
    flexDirection: "row",
    alignItems: "flex-end",
  },
  nameLabel: { fontFamily: "EBGaramond", fontSize: 10, color: COLORS.ink },
  // S-28: the line for the member's name is at least 50 mm long.
  nameLine: {
    flex: 1,
    marginLeft: 2 * MM,
    marginBottom: 2.5,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.muted,
  },
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

/** The cut lines around the cards on one page; a shared edge is drawn once. */
function CutLines({ count }: { count: number }) {
  const edges = new Map<string, number[]>();
  for (let index = 0; index < count; index++) {
    const left = (index % 2) * CARD_WIDTH;
    const top = Math.floor(index / 2) * CARD_HEIGHT;
    const right = left + CARD_WIDTH;
    const bottom = top + CARD_HEIGHT;
    for (const edge of [
      [left, top, right, top],
      [left, bottom, right, bottom],
      [left, top, left, bottom],
      [right, top, right, bottom],
    ])
      edges.set(edge.map((value) => value.toFixed(2)).join(" "), edge);
  }
  // Half a millimetre of room on every side, so the outer lines are not clipped.
  const width = 2 * CARD_WIDTH + 1;
  const height = 5 * CARD_HEIGHT + 1;
  return (
    <Svg
      style={styles.cutLines}
      width={width * MM}
      height={height * MM}
      viewBox={`-0.5 -0.5 ${width} ${height}`}
    >
      {[...edges].map(([key, [x1, y1, x2, y2]]) => (
        <Line
          key={key}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={COLORS.cut}
          strokeWidth={0.15}
          strokeDasharray="1.2 0.8"
        />
      ))}
    </Svg>
  );
}

/** D-71: the cream card, its soft waves and the bronze frame. */
function CardBackground() {
  const left = FRAME_INSET;
  const top = FRAME_INSET;
  const right = CARD_WIDTH - FRAME_INSET;
  const bottom = CARD_HEIGHT - FRAME_INSET;
  const frame = {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    rx: FRAME_RADIUS,
    ry: FRAME_RADIUS,
  };
  return (
    <Svg
      style={styles.background}
      width={CARD_WIDTH * MM}
      height={CARD_HEIGHT * MM}
      viewBox={`0 0 ${CARD_WIDTH} ${CARD_HEIGHT}`}
    >
      <Defs>
        <LinearGradient id="paper" x1="0" y1="0" x2="1" y2="0.3">
          <Stop offset="0.3" stopColor={COLORS.paperLight} />
          <Stop offset="1" stopColor={COLORS.paperDark} />
        </LinearGradient>
        <ClipPath id="frame">
          <Rect {...frame} />
        </ClipPath>
      </Defs>
      <Rect {...frame} fill="url(#paper)" />
      <G clipPath="url(#frame)">
        <Path
          d={`M58 ${top} C66 14 50 24 44 34 S32 48 30 ${bottom} L${right} ${bottom} L${right} ${top} Z`}
          fill={COLORS.wave}
          fillOpacity={0.35}
        />
        <Path
          d={`M72 ${top} C78 12 66 26 60 36 S52 48 50 ${bottom} L${right} ${bottom} L${right} ${top} Z`}
          fill={COLORS.wave}
          fillOpacity={0.45}
        />
        <Path
          d={`M${right} 22 C78 28 74 38 70 44 S66 50 64 ${bottom} L${right} ${bottom} Z`}
          fill={COLORS.wave}
          fillOpacity={0.6}
        />
        <Path
          d={`M64 ${top} C71 13 57 25 51 35 S41 48 39 ${bottom}`}
          fill="none"
          stroke="#ffffff"
          strokeOpacity={0.45}
          strokeWidth={0.8}
        />
      </G>
      <Rect {...frame} fill="none" stroke={COLORS.frame} strokeWidth={0.2} />
    </Svg>
  );
}

/** D-71: the KP mark in the bronze of the gym's printed logo. */
function KpMark() {
  return (
    <Svg
      width={MARK_WIDTH * MM}
      height={MARK_HEIGHT * MM}
      viewBox={KP_MARK_VIEWBOX}
    >
      <Defs>
        <LinearGradient id="bronze" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#86654e" />
          <Stop offset="0.5" stopColor="#b9987e" />
          <Stop offset="1" stopColor="#8e6d55" />
        </LinearGradient>
      </Defs>
      <Path d={KP_MARK_PATH} fill="url(#bronze)" />
    </Svg>
  );
}

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
      <CardBackground />
      <View style={styles.brand}>
        {/* S-28: an uploaded gym logo takes the mark's place. */}
        {logo ? <Image style={styles.logo} src={logo} /> : <KpMark />}
        <View style={styles.divider} />
        <View style={styles.brandText}>
          <Text style={styles.gymName}>{gymName}</Text>
          <Text style={styles.handle}>{me.cards.handle}</Text>
        </View>
      </View>
      <View style={styles.qrBox}>
        <View style={styles.qrFrame}>
          <Image style={styles.qr} src={card.qr} />
        </View>
        <Text style={styles.code}>{formatCardCode(card.code)}</Text>
      </View>
      <View style={styles.nameRow}>
        <Text style={styles.nameLabel}>{me.cards.nameLabel}</Text>
        <View style={styles.nameLine} />
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
  // is rendered large enough that 30 mm of paper still holds crisp modules; its dark
  // brown on near-white keeps the scanner's contrast.
  const cards: CardData[] = await Promise.all(
    codes.map(async (code) => ({
      code,
      qr: await QRCode.toDataURL(code, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 600,
        color: { dark: COLORS.qrDark, light: COLORS.qrLight },
      }),
    })),
  );

  return renderToBuffer(
    <Document title={me.cards.pdfTitle}>
      {chunk(cards, 10).map((pageCards, pageIndex) => (
        <Page key={pageIndex} size="A4" style={styles.page}>
          <View style={styles.sheet}>
            <CutLines count={pageCards.length} />
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
          </View>
        </Page>
      ))}
    </Document>,
  );
}
