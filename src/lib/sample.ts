import { addDays, today } from "./dates";
import type { IconName, Item, Status, Trip } from "./types";

type Row = [day: number, start: string, end: string, icon: IconName, title: string, status: Status, place: string, lat: number | null, lng: number | null, note: string];

function rows(tripId: string, start: string, list: Row[]): Item[] {
  return list.map(([d, s, e, icon, title, status, place, lat, lng, note], i) => ({
    id: `${tripId}-${i + 1}`,
    tripId,
    day: addDays(start, d),
    start: s,
    end: e,
    icon,
    title,
    status,
    place,
    lat,
    lng,
    note,
    done: false,
    order: i,
  }));
}

/**
 * Two example trips with dates relative to today: Osaka is running right now (day 2),
 * Busan starts in six weeks. Coordinates are approximate.
 */
export function buildSamples(): { trips: Trip[]; items: Item[] } {
  const t0 = today();
  const osakaStart = addDays(t0, -1);
  const busanStart = addDays(t0, 42);
  const osaka: Trip = {
    id: "sample-osaka",
    title: "오사카 2박 3일 (샘플)",
    kind: "overseas",
    country: "일본",
    city: "오사카",
    start: osakaStart,
    nights: 2,
    season: "",
    origin: "",
    transport: "",
    companions: "연인·부부",
    styles: ["맛집", "쇼핑", "야경"],
    pace: "보통",
    memo: "",
    legs: {
      out: { mode: "flight", from: "ICN", to: "KIX", dep: `${osakaStart}T08:30`, arr: `${osakaStart}T10:15`, no: "" },
      back: { mode: "flight", from: "KIX", to: "ICN", dep: `${addDays(osakaStart, 2)}T19:40`, arr: `${addDays(osakaStart, 2)}T21:35`, no: "" },
    },
    dayLabels: {
      [osakaStart]: "오사카성 · 도톤보리",
      [addDays(osakaStart, 1)]: "유니버설 스튜디오",
      [addDays(osakaStart, 2)]: "쿠로몬 · 우메다 · 귀국",
    },
    notice: "샘플 여행이에요. 아래 입력창에 \"카페 미정인 거 채워줘\"처럼 말해 보세요.",
    recs: [
      { id: "r1", icon: "nature", title: "미노오 공원 단풍 산책", area: "미노오", why: "단풍은 보통 11월 중하순이 절정이라 시기에 따라 이를 수 있어요. 폭포까지 이어지는 계곡길이 좋아요." },
      { id: "r2", icon: "night", title: "우메다 스카이 빌딩 일몰", area: "우메다", why: "해가 일찍 지는 계절이라 늦은 오후에 가면 노을과 야경을 한 번에 볼 수 있어요." },
      { id: "r3", icon: "nature", title: "나카노시마 공원 장미정원", area: "기타하마", why: "가을 장미가 피는 때라 강변 산책과 함께 보기 좋아요. 개화 상태는 확인이 필요해요." },
    ],
    createdAt: 1,
  };
  const osakaItems = rows("sample-osaka", osakaStart, [
    [0, "10:20", "11:40", "train", "입국 후 난바로 이동", "check", "Nankai Namba Station Osaka", 34.6625, 135.5016, "난카이 라피트 좌석 지정권 확인"],
    [0, "11:50", "12:20", "stay", "숙소에 짐 맡기기", "todo", "", null, null, "숙소 이름을 알려주면 위치를 넣어 줄게요"],
    [0, "12:30", "13:30", "food", "점심: 이치란 라멘 도톤보리", "confirmed", "Ichiran Dotonbori Osaka", 34.6688, 135.5017, ""],
    [0, "14:00", "16:00", "sight", "오사카성 공원 · 천수각", "check", "Osaka Castle", 34.6873, 135.5259, "천수각 입장 마감 시간 확인"],
    [0, "16:30", "18:00", "shop", "신사이바시스지 쇼핑", "confirmed", "Shinsaibashi-suji Shopping Street Osaka", 34.674, 135.5014, ""],
    [0, "19:00", "20:00", "food", "저녁: 쿠시카츠", "optional", "Kushikatsu Daruma Dotonbori Osaka", 34.6687, 135.503, ""],
    [0, "20:00", "21:00", "night", "도톤보리 야경 · 글리코 사인", "confirmed", "Glico Sign Dotonbori Osaka", 34.6689, 135.5011, ""],
    [1, "08:00", "08:40", "train", "유니버설 시티역으로 이동", "confirmed", "Universal City Station Osaka", 34.6677, 135.4372, ""],
    [1, "08:45", "19:30", "activity", "유니버설 스튜디오 재팬", "check", "Universal Studios Japan", 34.6654, 135.4323, "입장권 · 익스프레스 패스 날짜 확인 · 점심은 파크 안에서"],
    [1, "20:30", "21:30", "food", "저녁: 숙소 근처", "todo", "", null, null, "식당 미정"],
    [1, "21:30", "22:00", "cafe", "카페에서 쉬기", "todo", "", null, null, "카페 미정"],
    [2, "09:00", "10:00", "food", "쿠로몬 시장 아침", "confirmed", "Kuromon Ichiba Market Osaka", 34.6655, 135.5067, ""],
    [2, "10:00", "10:30", "stay", "체크아웃 · 짐 맡기기", "todo", "", null, null, ""],
    [2, "11:00", "12:30", "night", "우메다 스카이 빌딩 공중정원", "optional", "Umeda Sky Building Osaka", 34.7053, 135.4903, "입장권 · 운영 시간 확인"],
    [2, "13:30", "15:00", "shop", "그랜드 프런트 오사카", "optional", "Grand Front Osaka", 34.7046, 135.495, ""],
    [2, "15:30", "16:40", "train", "짐 찾고 공항으로", "check", "Kansai International Airport", null, null, "출국 3시간 전 공항 도착 목표"],
  ]);
  const busan: Trip = {
    id: "sample-busan",
    title: "부산 1박 2일 (샘플)",
    kind: "domestic",
    country: "대한민국",
    city: "부산",
    start: busanStart,
    nights: 1,
    season: "",
    origin: "서울",
    transport: "KTX·기차",
    companions: "연인·부부",
    styles: ["맛집", "바다", "야경"],
    pace: "보통",
    memo: "돼지국밥은 꼭 먹고 싶어요. 회는 못 먹어요.",
    legs: {
      out: { mode: "KTX·기차", from: "서울", to: "부산", dep: "", arr: `${busanStart}T10:45` },
      back: { mode: "KTX·기차", from: "부산", to: "서울", dep: `${addDays(busanStart, 1)}T19:30`, arr: "" },
    },
    dayLabels: { [busanStart]: "해운대 · 광안리", [addDays(busanStart, 1)]: "감천 · 남포 · 영도" },
    notice: "",
    recs: [
      { id: "r1", icon: "night", title: "광안대교 야경", area: "광안리", why: "해가 일찍 져서 저녁 일찍부터 야경을 볼 수 있어요." },
      { id: "r2", icon: "nature", title: "동백섬 산책", area: "해운대", why: "바다를 끼고 한 바퀴 걷기 좋은 짧은 산책로예요." },
    ],
    createdAt: 2,
  };
  const busanItems = rows("sample-busan", busanStart, [
    [0, "11:00", "12:00", "food", "점심: 돼지국밥", "todo", "", null, null, "부산역 근처로 찾는 중"],
    [0, "13:00", "15:00", "beach", "해운대 해수욕장 산책", "confirmed", "해운대해수욕장", 35.1587, 129.1604, ""],
    [0, "15:10", "16:40", "train", "해변열차 미포 → 청사포", "check", "해운대블루라인파크 미포정거장", 35.1607, 129.1713, "좌석 예매 확인"],
    [0, "19:00", "21:00", "night", "광안리 야경", "confirmed", "광안리해수욕장", 35.1532, 129.1187, ""],
    [1, "09:30", "11:30", "sight", "감천문화마을", "confirmed", "감천문화마을", 35.0975, 129.0106, ""],
    [1, "12:00", "13:00", "food", "남포동 간식 거리", "optional", "BIFF광장", 35.0989, 129.028, ""],
    [1, "14:00", "16:00", "nature", "흰여울문화마을", "confirmed", "흰여울문화마을", 35.0782, 129.0452, ""],
    [1, "18:00", "19:00", "train", "부산역으로 이동", "confirmed", "부산역", 35.1151, 129.0422, "19:30 KTX"],
  ]);
  return { trips: [osaka, busan], items: [...osakaItems, ...busanItems] };
}
