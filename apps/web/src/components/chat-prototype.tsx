"use client";

import { ADMIN_PERMISSION_OPTIONS, GLIMPSE_CHAT_VERSION, MEDIA_LIMITS, TRANSLATION_LANGUAGE_OPTIONS, type AdminPermission, type ArchivePreviewResponse, type AuthResponse, type CallMediaKind, type CallSignalEvent, type CallSignalPayload, type ConversationHistoryResponse, type ConversationSummary, type DocumentPreviewResponse, type GroupMemberSummary, type MessagePayload, type OfficeConversionFormat, type PublicUser, type TranslationLanguage, type UploadedMediaResponse, type UserLanguage } from "@glimpse/shared";
import { ClipboardEvent, FormEvent, KeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode, UIEvent as ReactUIEvent, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, AudioLines, Ban, Bell, Bot, Brush, Check, CheckCheck, Circle, Copy, CopyCheck, Crop, Globe2, Grid3X3, GripVertical, Download, FileText, Highlighter, Languages, Keyboard as KeyboardIcon, MapPin, Maximize2, MessageCircle, Mic, MicOff, Minimize2, Music2, Paperclip, Phone, PhoneOff, Play, Plus, Navigation, RefreshCw, Reply, RotateCcw, RotateCw, Search, Send, Settings, Smile, Square, Star, StickyNote, Tag, Trash2, Type, UserPlus, Users, Video, VideoOff, Volume2, X, ZoomIn, ZoomOut } from "lucide-react";
import { createPortal } from "react-dom";
import type { WheelEvent as ReactWheelEvent } from "react";
import { io, Socket } from "socket.io-client";
import { splitTextForTts } from "../lib/tts";
import { translationAttributionParts } from "../lib/translation-attribution";
import { GlimpseAssistant } from "./glimpse-assistant";
import { DocumentPdfViewer } from "./document-pdf-viewer";
import { DocumentZoomSurface } from "./document-zoom-surface";
import { SpreadsheetPreview } from "./spreadsheet-preview";
import { RICH_STICKERS, STICKER_CATEGORIES } from "./sticker-library";

type Tab = "chats" | "contacts" | "meetings" | "moments" | "me";
type MobilePane = "list" | "chat";
type PersistedWorkspaceView = { tab: Tab; conversationId: string; mobilePane: MobilePane };
type UiLanguage = "zh" | "en" | "hi";
type MessageSendStatus = "sending" | "sent" | "delivered" | "read" | "failed";
type ConnectionState = "connected" | "reconnecting" | "offline";
type MessageLoadState = "loading" | "ready" | "failed";
type MessageDisplayMode = "original" | "translated" | "bilingual";
type MessageActionDisplayMode = "inline" | "compact" | "long-press";
type MessageTimeDisplayMode = "bottom" | "tail" | "hidden";
type SpeechAccent = "auto" | "en-IN" | "en-US" | "en-GB" | "zh-CN" | "zh-TW" | "hi-IN" | "ta-IN" | "te-IN" | "bn-IN" | "ar-SA" | "ur-PK" | "ja-JP" | "ko-KR";
type PendingAutoTranslation = { message: MessagePayload; targetLanguage: TranslationLanguage };
type ReplyDraft = { id: string; senderName?: string; type: MessagePayload["type"]; body?: string };
type MediaPreview = { url: string; type: "image" | "video" | "audio" | "avatar"; name?: string; muted?: boolean };
type ArchivePreviewState = ArchivePreviewResponse & { loading?: boolean; error?: string };
type DocumentPreviewState = DocumentPreviewResponse & { loading?: boolean; error?: string; downloadUrl?: string; sourceMessage?: MessagePayload; convertedFile?: UploadedMediaResponse; conversionStatus?: string };
const STARRED_CONTACT_TAG = "__glimpse_starred__";
type DocumentTranslationReply = { answer: string; model: string; fileName: string | null; generatedFile?: UploadedMediaResponse };
type DocumentTranslationViewMode = "original" | "translated" | "bilingual";
type GalleryMediaPreview = MediaPreview & { gallery?: MessagePayload[]; galleryIndex?: number };
type ScreenshotTool = 'select' | 'pen' | 'highlight' | 'mosaic' | 'rectangle' | 'ellipse' | 'arrow' | 'text';
type ScreenshotPenType = 'round' | 'square' | 'dashed';
type ScreenshotPoint = { x: number; y: number };
type ScreenshotSelection = { x: number; y: number; width: number; height: number };
const SCREENSHOT_TOOL_OPTIONS = [
  { value: 'select', zh: '矩形框选', en: 'Rectangular select', hi: 'आयताकार चयन' },
  { value: 'pen', zh: '画笔', en: 'Pen', hi: 'पेन' },
  { value: 'highlight', zh: '高亮', en: 'Highlight', hi: 'हाइलाइट' },
  { value: 'mosaic', zh: '马赛克', en: 'Mosaic', hi: 'मोज़ेक' },
  { value: 'rectangle', zh: '矩形', en: 'Rectangle', hi: 'आयत' },
  { value: 'ellipse', zh: '椭圆', en: 'Ellipse', hi: 'अंडाकार' },
  { value: 'arrow', zh: '箭头', en: 'Arrow', hi: 'तीर' },
  { value: 'text', zh: '文字', en: 'Text', hi: 'टेक्स्ट' }
] as const;
const SCREENSHOT_SIZE_OPTIONS = [2, 4, 6, 10, 16] as const;
const SCREENSHOT_PEN_TYPE_OPTIONS = [
  { value: 'round', zh: '圆头笔', en: 'Round pen', hi: 'गोल पेन' },
  { value: 'square', zh: '方头笔', en: 'Square pen', hi: 'चौकोर पेन' },
  { value: 'dashed', zh: '虚线笔', en: 'Dashed pen', hi: 'डैश पेन' }
] as const;
function screenshotToolIcon(tool: ScreenshotTool) {
  if (tool === 'select') return <Crop size={16} />;
  if (tool === 'pen') return <Brush size={16} />;
  if (tool === 'highlight') return <Highlighter size={16} />;
  if (tool === 'mosaic') return <Grid3X3 size={16} />;
  if (tool === 'rectangle') return <Square size={16} />;
  if (tool === 'ellipse') return <Circle size={16} />;
  if (tool === 'arrow') return <ArrowUpRight size={16} />;
  return <Type size={16} />;
}
type ScreenshotAnnotation =
  | { id: string; kind: 'pen'; points: ScreenshotPoint[]; color: string; width: number; penType?: ScreenshotPenType }
  | { id: string; kind: 'highlight'; points: ScreenshotPoint[]; color: string; width: number }
  | { id: string; kind: 'mosaic'; points: ScreenshotPoint[]; color: string; width: number }
  | { id: string; kind: 'rectangle' | 'ellipse' | 'arrow'; start: ScreenshotPoint; end: ScreenshotPoint; color: string; width: number }
  | { id: string; kind: 'text'; point: ScreenshotPoint; text: string; color: string; width: number };
type ScreenshotTextAnnotation = Extract<ScreenshotAnnotation, { kind: 'text' }>;
type ScreenshotOcrBlock = {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  translatedText?: string;
  fontColor?: string;
  backgroundColor?: string;
  fontWeight?: 'normal' | 'bold';
  textAlign?: 'left' | 'center' | 'right';
};
type ScreenshotHistoryState = {
  selection: ScreenshotSelection | null;
  annotations: ScreenshotAnnotation[];
  rotation: number;
  source?: string;
  sourceSize?: { width: number; height: number };
  ocrText: string;
  ocrBlocks: ScreenshotOcrBlock[];
  ocrTranslationText: string;
};
type ScreenshotGesture = {
  pointerId: number;
  tool: ScreenshotTool;
  start: ScreenshotPoint;
  annotationId?: string;
  mode?: 'draw' | 'move-text' | 'resize-text';
  textOffset?: ScreenshotPoint;
  initialWidth?: number;
};
type PendingVoicePreview = { file: File; url: string; name: string };
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onresult: ((event: { resultIndex?: number; results: ArrayLike<{ isFinal: boolean; [index: number]: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
type MediaAlbumContext = { id: string; index: number; size: number };
type MediaSendVariant = "preview" | "original";
type MessageReminder = { id: string; conversationId: string; messageId: string; title: string; body: string; remindAt: string; done?: boolean };
type FavoriteMessageView = { id: string; createdAt: string; tags?: string[]; message: MessagePayload; conversation?: { id: string; title?: string | null; type?: string } };
type GlobalSearchResult = { id: string; kind: "conversation" | "contact" | "message" | "favorite"; title: string; subtitle: string; conversationId?: string; messageId?: string; message?: MessagePayload; user?: SearchUser; favorite?: FavoriteMessageView; avatarUrl?: string | null; avatarKind?: "user" | "group" };
type AppSlogan = { id: string; zh: string; en: string; hi: string };
type AdminSlogan = AppSlogan & { enabled: boolean };
const DEFAULT_APP_SLOGANS: AppSlogan[] = [
  { id: "s01", zh: "让每一次跨语言沟通都清晰可追溯。", en: "Make every cross-language conversation clear and traceable.", hi: "हर भाषा की बातचीत साफ और भरोसेमंद रहे।" },
  { id: "s02", zh: "原文、译文和文件，一起保留上下文。", en: "Keep originals, translations, and files in one context.", hi: "मूल संदेश, अनुवाद और फाइलें एक ही संदर्भ में रहें।" },
  { id: "s03", zh: "为中印业务沟通减少误解。", en: "Reduce misunderstanding in China-India business chats.", hi: "चीन-भारत व्यापार संवाद में गलतफहमी कम करें।" },
  { id: "s04", zh: "消息发出去，也把意思传准确。", en: "Send the message and preserve the meaning.", hi: "संदेश भेजें और अर्थ भी सही रखें।" },
  { id: "s05", zh: "跨语言协作，从可靠的聊天记录开始。", en: "Cross-language teamwork starts with reliable chat history.", hi: "बहुभाषी सहयोग भरोसेमंद चैट इतिहास से शुरू होता है।" },
  { id: "s06", zh: "让客户、同事和资料在同一个工作空间里。", en: "Keep customers, teammates, and materials in one workspace.", hi: "ग्राहक, टीम और दस्तावेज एक ही जगह रखें।" },
  { id: "s07", zh: "翻译不是附加功能，而是沟通的一部分。", en: "Translation is not an add-on; it is part of the conversation.", hi: "अनुवाद अलग सुविधा नहीं, संवाद का हिस्सा है।" },
  { id: "s08", zh: "重要内容可查、可读、可复核。", en: "Important content stays searchable, readable, and reviewable.", hi: "जरूरी जानकारी खोजी, पढ़ी और जांची जा सके।" },
  { id: "s09", zh: "在不同语言之间，保持同一个事实版本。", en: "Keep one shared version of facts across languages.", hi: "अलग भाषाओं में भी तथ्य एक जैसे रहें।" },
  { id: "s10", zh: "让语音、图片、文件都能进入同一条沟通链。", en: "Bring voice, images, and files into one conversation chain.", hi: "वॉइस, चित्र और फाइलें एक बातचीत श्रृंखला में रखें।" },
  { id: "s11", zh: "沟通更快，证据更完整。", en: "Communicate faster with fuller records.", hi: "तेज संवाद, पूरा रिकॉर्ड।" },
  { id: "s12", zh: "把语言差异变成可管理的信息流。", en: "Turn language gaps into manageable information flow.", hi: "भाषा अंतर को नियंत्रित सूचना प्रवाह बनाएं।" },
  { id: "s13", zh: "每条消息都服务于更准确的合作。", en: "Every message supports more accurate cooperation.", hi: "हर संदेश बेहतर सहयोग में मदद करे।" },
  { id: "s14", zh: "从聊天到资料归档，保持业务连续。", en: "Keep business continuity from chat to archived materials.", hi: "चैट से दस्तावेज तक काम लगातार चलता रहे।" },
  { id: "s15", zh: "给跨境团队一个共同理解的聊天空间。", en: "Give cross-border teams a shared understanding space.", hi: "सीमा-पार टीमों को साझा समझ का चैट स्पेस दें।" },
  { id: "s16", zh: "让翻译结果可以被看见、比较和修正。", en: "Make translations visible, comparable, and correctable.", hi: "अनुवाद दिखे, तुलना हो और सुधारा जा सके।" },
  { id: "s17", zh: "沟通内容沉淀下来，下一次更快开始。", en: "Save communication context so the next chat starts faster.", hi: "संदर्भ सहेजें, अगली बातचीत तेजी से शुरू करें।" },
  { id: "s18", zh: "让跨语言聊天像同语言一样自然。", en: "Make cross-language chat feel as natural as one-language chat.", hi: "बहुभाषी चैट को स्वाभाविक बनाएं।" },
  { id: "s19", zh: "面向真实业务场景设计的翻译聊天工具。", en: "A translation chat tool designed for real business work.", hi: "वास्तविक व्यापार के लिए बना अनुवाद चैट टूल।" },
  { id: "s20", zh: "清楚表达，准确保存，随时找回。", en: "Express clearly, save accurately, and find it anytime.", hi: "स्पष्ट लिखें, सही सहेजें, कभी भी खोजें।" }
];

function defaultAdminSlogans(): AdminSlogan[] {
  return DEFAULT_APP_SLOGANS.map((slogan) => ({ ...slogan, enabled: true }));
}

function parseAdminSlogans(raw: string | undefined): AdminSlogan[] {
  if (!raw?.trim()) return defaultAdminSlogans();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return defaultAdminSlogans();
    const normalized = parsed
      .map((item, index) => {
        const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
        return {
          id: String(row.id ?? `custom-${index + 1}`).trim(),
          zh: String(row.zh ?? "").trim(),
          en: String(row.en ?? "").trim(),
          hi: String(row.hi ?? "").trim(),
          enabled: row.enabled !== false
        } satisfies AdminSlogan;
      })
      .filter((slogan) => slogan.id && slogan.zh && slogan.en && slogan.hi);
    return normalized.length ? normalized : defaultAdminSlogans();
  } catch {
    return defaultAdminSlogans();
  }
}

function serializeAdminSlogans(slogans: AdminSlogan[]) {
  return JSON.stringify(slogans.map(({ id, zh, en, hi, enabled }) => ({ id, zh, en, hi, enabled })));
}

function pickRandomSlogan(slogans: AppSlogan[]) {
  const list = slogans.length ? slogans : DEFAULT_APP_SLOGANS;
  return (list[Math.floor(Math.random() * list.length)] ?? DEFAULT_APP_SLOGANS[0])!;
}

const CONTACT_PINYIN_INITIAL_GROUPS: ReadonlyArray<readonly [string, string]> = [
  ["A", "阿啊埃挨哎唉哀皑癌蔼矮艾碍爱隘鞍氨安俺按暗岸胺案"],
  ["B", "八巴芭疤拔跋把坝爸罢霸白百柏摆败拜稗斑班搬般颁板版办半伴扮拌瓣邦帮梆榜膀蚌傍棒磅包胞宝饱保报抱暴豹鲍爆杯碑悲卑北贝钡倍备背被辈奔苯本崩绷甭泵蹦逼鼻比鄙笔彼碧蓖蔽毕毙毖币必闭辟壁臂避边编贬变便遍辨辩标彪表别宾滨缤冰兵丙柄秉饼并病拨波玻剥播伯驳泊勃博薄卜补捕哺不布步"],
  ["C", "擦猜裁材才财采彩菜蔡餐参蚕残惭惨灿仓苍舱藏操糙曹槽草厕策侧测层蹭叉插查茶察岔差拆柴豺搀掺蝉馋缠产铲阐颤昌猖场尝常长偿肠厂敞畅唱超抄钞朝潮巢吵车扯彻撤辰臣尘陈沉闯称城橙成承诚呈乘程惩澄吃痴持匙池迟弛驰赤翅斥炽充冲虫崇抽仇臭初出橱厨躇锄雏础储楚处触川穿传船喘窗床创吹炊垂春椿纯唇淳醇磁雌辞慈瓷词此刺赐次聪葱从丛凑粗促醋簇脆翠村存寸"],
  ["D", "搭达答打大呆歹傣带殆代贷袋待逮戴丹单担胆旦但淡诞弹蛋当挡党荡刀导岛倒蹈盗德得的灯登等瞪低滴敌笛狄迪底抵地递帝弟第颠典点电店垫惦奠淀殿刁掉吊钓调跌爹碟蝶丁叮盯钉顶鼎定订丢东冬董懂动栋侗洞都兜斗抖陡豆逗督毒独读堵睹赌杜镀肚度端短段断缎堆兑队对墩吨蹲敦盾遁多夺朵躲"],
  ["E", "额俄鹅恶饿恩而儿耳尔二"],
  ["F", "发罚阀法珐帆番翻繁凡烦反返范贩犯饭方芳坊房防妨仿访纺放飞非菲啡肥匪诽肺废沸费分芬吩纷焚粉奋份愤粪丰封风疯峰锋蜂冯逢缝凤奉佛否夫敷肤孵扶浮符幅福伏服府父腹负富赋复傅付阜"],
  ["G", "该改概钙盖溉干甘杆柑竿肝赶敢感橄刚钢缸纲岗港高膏糕搞告哥歌格阁隔革葛个各给根跟更耕工攻功恭公宫弓巩汞拱共贡勾沟钩狗苟构购够估姑孤古谷股骨鼓固故顾瓜刮挂乖拐怪关观官冠馆管贯惯灌光广逛归规龟闺硅鬼轨滚棍锅郭国果裹过"],
  ["H", "哈蛤虾孩海害酣憨寒含函涵韩罕汉汗航夯好号浩呵喝合何和河荷核盒贺黑嘿痕很狠恨亨哼恒横衡轰红宏洪虹鸿侯喉猴吼厚后呼忽狐胡湖糊蝴虎互护花哗华滑画化话怀徊坏欢环桓还缓换患唤焕幻荒慌黄皇凰晃灰挥辉徽回毁悔汇会惠慧昏婚魂混活火伙或货获祸"],
  ["J", "击饥机鸡积基激及吉极即急疾集几己挤脊计记纪技忌际剂季既济继寄寂加佳家嘉甲价架驾嫁坚尖间肩艰兼监煎拣俭碱检简减剪见件建剑健舰江姜将奖讲酱降交郊浇骄娇焦胶角脚搅叫教较觉阶皆接街节结捷杰姐解介届借巾斤今金津筋仅紧锦进近尽劲京经惊晶精井景颈静境敬镜九久酒救就旧居拘局举巨具句据距聚剧捐卷倦决绝军君均菌"],
  ["K", "喀咖卡开凯慨楷刊堪勘坎看康慷抗炕考烤靠科棵颗磕壳可渴克刻客课肯啃坑空恐孔控口扣库苦酷夸垮挎跨块快宽款狂况矿框旷眶亏盔葵奎魁傀愧溃昆捆困扩括阔"],
  ["L", "拉啦喇蜡腊辣来莱赖蓝栏拦篮兰澜谰览懒烂滥狼廊郎朗浪捞劳牢老姥乐勒雷镭蕾磊类泪累冷愣梨离莉黎礼里理李力历厉立利例丽粒俩连联莲廉脸练炼恋链良凉梁粮两亮谅辆量辽疗聊僚了料列烈裂猎林临邻鳞淋琳霖磷灵玲凌陵领另令溜刘流留柳龙隆笼楼搂篓漏露鲁炉芦卢卤鹿潞路录陆驴吕铝侣旅屡缕律虑率绿乱卵略掠伦轮论罗萝逻锣箩骆络落洛"],
  ["M", "妈麻马玛码蚂骂吗埋买麦卖迈脉瞒蛮满蔓曼慢漫芒茫盲猫毛矛茅锚铆冒帽貌贸梅枚眉媒每美妹门闷们蒙萌猛梦孟米秘密蜜眠绵棉免勉面苗描秒妙民敏名明鸣铭命摸模摩磨魔抹末莫墨默陌谋某母亩牡木目牧穆"],
  ["N", "拿哪纳娜乃奶耐南男难囊恼脑闹呢内嫩能泥倪尼拟你逆年念娘鸟尿捏您宁凝牛扭纽农浓弄奴努怒女暖虐挪诺"],
  ["O", "哦欧偶"],
  ["P", "怕拍排牌派潘攀盘判叛盼胖抛泡袍跑陪培赔佩沛喷盆朋棚蓬碰批披劈琵皮疲脾匹屁譬篇偏片骗漂飘票拼贫频品平评凭坡泼颇破婆迫剖普浦谱"],
  ["Q", "七期其奇骑棋旗起企启气弃器契砌恰千迁签铅谦前钱潜浅遣欠枪腔强墙抢悄桥敲乔侨巧俏切茄且窃亲侵秦琴勤青轻清情晴请庆穷秋丘球求区曲趋渠取去趣圈权全泉犬劝却确雀群"],
  ["R", "然燃染壤让饶扰绕惹热人仁忍认刃任韧日荣容绒融冗柔肉如乳辱入软锐瑞润若弱"],
  ["S", "撒洒塞赛三叁伞散桑嗓丧搔扫嫂色涩森僧杀沙纱傻啥筛晒山删珊闪陕善擅商伤赏上尚烧稍绍少蛇舍社设射涉摄申伸身深什神沈审慎肾甚至生声牲胜绳省剩盛师失诗施湿十石时识实拾食史使始驶士世市事势是试收手首守寿授售受兽书抒舒输叔疏殊梳熟暑曙树数刷耍帅双霜爽水睡税顺瞬说硕死四伺寺松宋送搜嗖苏酥俗素速宿塑酸蒜算虽随绥岁遂碎孙损笋索所"],
  ["T", "塔塌踏他它她台抬太态泰贪摊滩坛谈坦汤唐堂塘糖倘躺趟涛桃逃淘特腾疼藤梯踢题提体替天添田甜填挑条跳贴铁听厅廷庭停亭挺通同桐童统痛头投透突图徒途涂土吐兔团推退吞屯托拖脱妥拓"],
  ["W", "哇蛙娃瓦袜外歪弯湾玩顽完晚万王网往望忘危威微为围唯维伟伪尾纬未味畏胃喂魏温文闻蚊稳问翁窝我沃卧乌污屋无吴吾五武舞务物误"],
  ["X", "西吸希悉惜晰溪稀锡熙嬉膝习席袭洗喜系细戏霞峡侠狭下夏仙先纤鲜闲贤弦咸显险现线限宪相香箱乡详祥想响向象萧硝销消宵小晓孝肖笑些协胁斜携鞋写谢新心欣辛薪信星兴形型醒幸姓兄凶雄修休秀袖需徐许蓄续絮序宣旋玄选学雪血勋熏寻巡询训讯迅"],
  ["Y", "压牙蚜芽雅亚咽烟淹盐严言岩沿炎研延颜阎眼演艳燕央扬杨羊阳洋养样邀腰妖瑶摇遥咬药要爷也野业叶页一依衣医宜遗移仪疑乙已以易义益意毅因音阴银引饮隐印英樱婴鹰迎赢盈影硬应哟拥庸雍永勇用优忧悠尤由油游有友又右幼于余鱼娱愉渔予宇雨语玉育郁遇誉元员园原圆缘远愿约越跃月岳云允运晕"],
  ["Z", "再在咱攒暂赞脏葬遭糟凿早澡蚤造责择则泽贼怎增憎曾赠扎渣炸摘宅窄债寨沾瞻斩展站占战张章涨掌丈帐账胀障招昭找沼照罩赵折哲这浙珍真针阵振镇争征睁蒸整正证郑只知支枝芝织直值职指止纸志至制治质致中忠终钟种重周州洲粥朱猪竹逐主煮助住注驻柱专砖转赚庄装妆壮状椎追准捉桌着资姿滋淄籽紫自字宗棕总纵走奏租足族祖阻组钻嘴最罪尊遵昨左坐作"]
];

function contactNameInitial(value: string) {
  const first = Array.from(value.trim())[0] ?? "";
  if (!first) return "#";
  const latin = first.toLocaleUpperCase();
  if (/^[A-Z]$/.test(latin)) return latin;
  if (/^[0-9]$/.test(first)) return "#";
  return CONTACT_PINYIN_INITIAL_GROUPS.find(([, chars]) => chars.includes(first))?.[0] ?? "#";
}
type LocationMessagePayload = { latitude: number; longitude: number; name?: string; address?: string };
type MediaLibraryFilter = "all" | "image" | "video" | "audio" | "file";
type MessageSearchType = "all" | "text" | "image" | "video" | "audio" | "file";
type VideoFitMode = "auto" | "portraitRight" | "portraitLeft" | "landscape";
type CallStatus = "ringing" | "connecting" | "active";
type ActiveCall = { callId: string; conversationId: string; media: CallMediaKind; status: CallStatus; direction: "incoming" | "outgoing"; peerName: string; startedAt: number; muted: boolean; cameraOff: boolean; participantUserIds?: string[] };
type IncomingCall = { callId: string; conversationId: string; media: CallMediaKind; fromUserId: string; fromName?: string; signalType: "join" | "offer"; sdp?: string; participantUserIds?: string[] };
type RemoteCallStream = { userId: string; name: string; stream: MediaStream; media: CallMediaKind; cameraOff?: boolean };
type CameraFacingMode = "user" | "environment";
type CallTileView = { id: string; name: string; stream: MediaStream | null; muted: boolean; videoEnabled: boolean; avatarUrl?: string | null; isLocal?: boolean };
const LOCATION_MESSAGE_PREFIX = "glimpse-location:v1:";
const STICKER_MESSAGE_PREFIX = "glimpse-sticker:v1:";
const TRANSLATION_EDIT_NOTICE_PREFIX = "glimpse-translation-edit-notice:v1:";

type StickerDefinition = {
  id: string;
  category: string;
  emoji: string;
  zh: string;
  en: string;
  hi: string;
  tone: string;
  imageUrl?: string;
};

const CLASSIC_STICKERS: Array<Omit<StickerDefinition, "category">> = [
  { id: "smile", emoji: "😀", zh: "开心", en: "Happy", hi: "खुश", tone: "from-amber-100 to-orange-50", imageUrl: "/stickers/glimpse-v4-lite/04-01-Happy.png" },
  { id: "laugh", emoji: "😂", zh: "大笑", en: "Laugh", hi: "हंसी", tone: "from-yellow-100 to-amber-50", imageUrl: "/stickers/glimpse-v4-lite/12-02-LOL.png" },
  { id: "thumbs-up", emoji: "👍", zh: "赞", en: "Like", hi: "पसंद", tone: "from-sky-100 to-cyan-50", imageUrl: "/stickers/glimpse-v4-lite/11-01-Like.png" },
  { id: "ok", emoji: "👌", zh: "好的", en: "OK", hi: "ठीक है", tone: "from-emerald-100 to-teal-50", imageUrl: "/stickers/glimpse-v4-lite/01-01-OK.png" },
  { id: "thanks", emoji: "🙏", zh: "谢谢", en: "Thanks", hi: "धन्यवाद", tone: "from-indigo-100 to-slate-50", imageUrl: "/stickers/glimpse-v4-lite/01-02-Thanks.png" },
  { id: "heart", emoji: "❤️", zh: "喜欢", en: "Love", hi: "प्यार", tone: "from-rose-100 to-pink-50", imageUrl: "/stickers/glimpse-v4-lite/11-06-Heart.png" },
  { id: "clap", emoji: "👏", zh: "鼓掌", en: "Clap", hi: "तालियां", tone: "from-lime-100 to-emerald-50", imageUrl: "/stickers/glimpse-v4-lite/11-04-Clap.png" },
  { id: "fire", emoji: "🔥", zh: "很棒", en: "Great", hi: "बहुत अच्छा", tone: "from-orange-100 to-red-50", imageUrl: "/stickers/glimpse-v4-lite/01-06-Great.png" },
  { id: "party", emoji: "🥳", zh: "庆祝", en: "Celebrate", hi: "जश्न", tone: "from-fuchsia-100 to-violet-50", imageUrl: "/stickers/glimpse-v4-lite/13-08-Celebrate.png" },
  { id: "thinking", emoji: "🤔", zh: "思考", en: "Thinking", hi: "सोच रहा हूं", tone: "from-slate-100 to-zinc-50", imageUrl: "/stickers/glimpse-v4-lite/04-03-Thinking.png" },
  { id: "surprised", emoji: "😮", zh: "惊讶", en: "Surprised", hi: "हैरान", tone: "from-cyan-100 to-blue-50", imageUrl: "/stickers/glimpse-v4-lite/12-05-Shocked.png" },
  { id: "sorry", emoji: "😅", zh: "不好意思", en: "Sorry", hi: "क्षमा करें", tone: "from-stone-100 to-orange-50", imageUrl: "/stickers/glimpse-v4-lite/01-07-Sorry.png" },
  { id: "coffee", emoji: "☕", zh: "休息一下", en: "Coffee break", hi: "कॉफी ब्रेक", tone: "from-amber-100 to-stone-50", imageUrl: "/stickers/glimpse-v4-lite/05-03-Coffee.png" },
  { id: "done", emoji: "✅", zh: "完成", en: "Done", hi: "पूरा", tone: "from-green-100 to-emerald-50", imageUrl: "/stickers/glimpse-v4-lite/03-08-Done.png" },
  { id: "urgent", emoji: "🚨", zh: "紧急", en: "Urgent", hi: "जरूरी", tone: "from-red-100 to-rose-50", imageUrl: "/stickers/glimpse-v4-lite/03-03-Deadline.png" },
  { id: "deal", emoji: "🤝", zh: "成交", en: "Deal", hi: "सौदा", tone: "from-teal-100 to-cyan-50", imageUrl: "/stickers/glimpse-v4-lite/11-02-Handshake.png" }
];
const BUILT_IN_STICKERS: StickerDefinition[] = [
  ...CLASSIC_STICKERS.map((sticker) => ({ ...sticker, category: "frequent" })),
  ...RICH_STICKERS
];

type Conversation = {
  id: string;
  name: string;
  preview: string;
  time: string;
  latestMessageAt?: string;
  unread: number;
  avatarUrl?: string | null;
  announcement?: string | null;
  announcementScroll?: boolean | null;
  ownerId?: string | null;
  memberCount?: number;
  otherUser?: SearchUser;
  type: "single" | "group";
  language: UiLanguage;
  online?: boolean;
};

type SearchUser = PublicUser & {
  email?: string | null;
  phone?: string | null;
};

type ContactMemoApiRecord = {
  userId?: string;
  body?: string;
  images?: string[];
  updatedAt?: string;
};

type BlockedUserView = {
  id: string;
  user: SearchUser;
  createdAt: string;
};
type FriendRequestView = {
  id: string;
  status: "pending" | "accepted" | "rejected";
  direction: "incoming" | "outgoing";
  user: SearchUser;
  createdAt: string;
  updatedAt: string;
};

const defaultConversation: Conversation = { id: "", name: "", preview: "", time: "", unread: 0, type: "single", language: "en" };
const copy = {
  zh: {
    subtitle: "中英互译 · Web/PWA",
    search: "按邮箱、手机号或昵称搜索",
    chats: "聊天",
    contacts: "联系人",
    me: "我的",
    meetings: "会议",
    selfLabel: "我自己",
    enterToSend: "Enter 发送，Ctrl+Enter 换行",
    ctrlEnterToSend: "Ctrl+Enter 发送，Enter 换行",
    mobileSendByButton: "手机：Enter 换行，点击发送按钮发送",
    sendShortcut: "发送快捷键",
    typing: "正在输入...",
    mentionUser: "@人",
    meetingComing: "会议功能将在后续版本接入。",
    pasteFileReady: "已从剪贴板读取文件，正在发送。",
    screenshotTool: "截图",
    forgotPassword: "忘记密码？",    auto: "服务器翻译已启用；公网测试前仍需验证语言范围和失败兜底",
    details: "详情",
    input: "输入消息...",
    attach: "发送图片、视频、音频或文件",
    uploadingMedia: "正在上传...",
    mediaUnsupported: "不支持该文件。请换一个文件重试。",
    mediaTooLarge: "文件超过允许大小。",
    mediaUploadFailed: "媒体上传失败，请重试。",
    mediaOpen: "打开预览",
    mediaClose: "关闭预览",
    rotateLeft: "左旋",
    rotateRight: "右旋",
    videoFitAuto: "自动",
    videoFitPortrait: "竖屏右转",
    videoFitPortraitAlt: "竖屏左转",
    videoFitLandscape: "横屏",
    uploadRetry: "重新上传",
    uploadCancel: "取消上传",
    mediaVideoTooLong: "视频不能超过 5 分钟。",
    mediaFiles: "聊天资料",
    mediaAll: "全部",
    mediaImages: "图片",
    mediaVideos: "视频",
    mediaAudios: "音频",
    mediaDocs: "文件",
    mediaEmpty: "这一类暂时没有资料。",
    mediaLoadOlder: "加载更早消息",
    mediaLocate: "定位到聊天位置",
    pinConversation: "置顶聊天",
    unpinConversation: "取消置顶",
    deleteChat: "删除聊天",
    chatDeleted: "聊天已从列表移除。",
    chatPinned: "聊天已置顶。",
    chatUnpinned: "已取消置顶。",
    voiceRecordStart: "录音",
    voiceRecordStop: "发送语音",
    voiceRecording: "录音中...",
    voiceRecordFailed: "语音录制失败，请检查麦克风权限。",
    voiceTranscript: "转文字",
    voiceTranscriptEmpty: "这条语音暂无可用文字。",
    voiceTranscriptHide: "收起文字",
    voicePreviewReady: "语音已录好，请试听后确认发送。",
    voiceSendConfirm: "发送",
    voiceCancel: "取消",
    messageRevoked: "消息已撤回",
    revokeMessage: "撤回",
    revokeFailed: "撤回失败或已超过允许时间。",
    downloadOriginal: "下载原文件",    settings: "设置",
    translationTarget: "翻译语言",
    displayMode: "消息显示",
    speechAccent: "朗读口音",
    speechAccentAuto: "跟随消息语言",
    originalOnly: "原文",
    translatedOnly: "译文",
    bilingual: "双语",
    notifications: "新消息提醒",
    notificationsHint: "未打开当前聊天窗口时弹出系统通知。",
    notificationSound: "提示音",
    notificationVibration: "手机振动",
    notificationPermission: "浏览器通知权限需要在首次开启时允许。",
    changePasswordTitle: "修改密码",
    currentPassword: "当前密码",
    newPassword: "新密码",
    confirmPassword: "确认新密码",
    profileSettingsTitle: "个人设置",
    showSenderNames: "聊天窗口显示发信人名字",
    profileNickname: "昵称",
    profileCompany: "公司",
    profileTitle: "职位",
    profileLocation: "地区",
    profileBio: "个人简介",
    profileSignature: "个性签名",
    profileEmail: "邮箱",
    profilePhone: "电话",
    profilePublicId: "ID",
    profilePublic: "公开个人资料",
    profileEmailPublic: "公开邮箱",
    profilePhonePublic: "公开电话",
    profileIdHint: "ID 可用于搜索你。3-32 位，只能包含字母、数字、点、下划线或短横线；半年内只能修改一次。",
    profileRole: "角色",
    profileLanguage: "界面语言",
    profileAvatar: "头像",
    uploadAvatar: "上传头像",
    cropAvatarTitle: "裁剪头像",
    cropAvatarConfirm: "使用头像",
    cropAvatarCancel: "取消",
    cropAvatarZoom: "缩放",
    saveProfile: "保存",
    editProfile: "编辑",
    editSignature: "编辑",
    saveSignature: "保存",
    registeredInfo: "注册与个人资料",
    profileSaved: "个人资料已保存。",
    profileSaveFailed: "个人资料保存失败。",
    viewContactDetails: "详情",
    contactDetailsTitle: "联系人详情",
    contactDetailsEmpty: "对方暂未填写公开资料",
    updatePassword: "更新密码",
    passwordUpdated: "密码已更新。",
    passwordMismatch: "两次输入的新密码不一致。",
    passwordTooShort: "新密码至少需要 8 个字符。",
    passwordChangeFailed: "密码修改失败，请检查当前密码。",
    feedbackTitle: "反馈",
    feedbackHint: "告诉我们你遇到的问题或建议。",
    feedbackPlaceholder: "请输入反馈内容...",
    feedbackSend: "提交反馈",
    feedbackSending: "提交中...",
    feedbackSent: "反馈已提交。",
    feedbackTooShort: "反馈内容至少需要 5 个字符。",
    feedbackFailed: "反馈提交失败，请稍后重试。",
    feedbackAttach: "添加问题截图",
    feedbackAttachmentReady: "截图已添加。",
    feedbackAttachmentRemove: "移除截图",
    versionLabel: "版本",
    adminDashboard: "管理后台",
    adminLoad: "打开管理后台",
    adminClose: "关闭",
    adminSearchUsers: "搜索用户",
    adminSearchFeedback: "搜索反馈",
    adminSearchConversations: "搜索会话",
    adminNoResults: "没有匹配结果",
    adminUsers: "用户",
    adminConversations: "会话",
    adminMessages: "消息",
    adminOpenFeedback: "待处理反馈",
    adminDisabledUsers: "停用用户",
    adminLoadFailed: "后台数据加载失败。",
    adminDisableUser: "禁用",
    adminEnableUser: "启用",
    adminUserDisabled: "用户已禁用。",
    adminUserEnabled: "用户已启用。",
    adminUserActionFailed: "用户状态更新失败。",
    adminRecentConversations: "最近会话",
    adminMembers: "成员",
    adminMessageCount: "消息数",
    adminFeedbackQueue: "反馈处理",
    adminMarkInReview: "处理中",
    adminMarkResolved: "已解决",
    adminMarkDismissed: "关闭",
    adminFeedbackUpdated: "反馈状态已更新。",
    adminFeedbackUpdateFailed: "反馈状态更新失败。",
    adminResetPassword: "重置密码",
    adminTempPassword: "临时密码",
    adminPasswordResetDone: "临时密码已生成。",
    adminPasswordResetFailed: "密码重置失败。",
    adminViewChats: "聊天信息",
    adminUserDetails: "用户资料",
    adminUserChats: "用户聊天信息",
    adminChatMessages: "聊天消息",
    adminNoMessages: "暂无消息",
    adminLoadUserChatsFailed: "用户聊天信息加载失败。",
    friendRequestsTitle: "联系人请求",
    friendsTitle: "联系人",
    acceptFriend: "接受",
    rejectFriend: "拒绝",
    friendRequestSent: "已打开聊天。",
    friendRequestAccepted: "已接受联系人请求。",
    friendRequestRejected: "已拒绝联系人请求。",
    blockUser: "拉黑",
    unblockUser: "取消拉黑",
    blockedUsersTitle: "已拉黑用户",
    userBlocked: "用户已拉黑。",
    userUnblocked: "已取消拉黑。",
    removeFriend: "删除联系人",
    copyShortcut: "复制快捷链接",
    shortcutCopied: "快捷链接已复制。",
    shortcutUnavailable: "请先打开一次聊天，再复制快捷链接。",
    friendRemoved: "联系人已删除。",
    friendRequestFailed: "联系人操作失败，请稍后重试。",
    addFriend: "保存联系人",
    openChat: "发信息",
    contactSaved: "联系人已保存。",
    profile: "当前用户可在多个浏览器窗口实时聊天。",
    empty: "没有匹配结果",
    connected: "实时服务已连接",
    disconnected: "实时服务未连接，请确认 API 已启动。",
    sent: "消息已通过 WebSocket 发出。",
    noConversations: "暂无会话。请在联系人中搜索用户并开始聊天。",
    contactHint: "按邮箱或昵称搜索，然后开始一对一聊天。",
    searching: "搜索中...",
    english: "英文",
    chinese: "中文",
    loadingOlder: "加载中...",
    loadOlder: "加载更早消息",
    requestFailed: "请求失败，请稍后重试。",
    searchFailed: "搜索失败，请稍后重试。",
    startConversationFailed: "无法开始会话，请稍后重试。",
    readStateFailed: "无法更新已读状态，请稍后重试。",
    olderMessagesFailed: "无法加载更早消息，请稍后重试。",
    authFailed: "认证失败，请检查账号和密码。",
    sessionExpired: "登录已过期，请重新登录。",
    newConversation: "新会话",
    loadingConversations: "正在加载会话...",
    conversationsFailed: "会话加载失败。",
    emptyConversation: "暂无消息，发送第一条消息开始聊天。",
    loadingMessages: "正在加载消息...",
    messagesFailed: "消息加载失败。",
    noMoreMessages: "没有更早的消息了。",
    createGroup: "创建群聊",
    groupTitle: "群聊名称",
    groupMembers: "选择群成员",
    groupCreateFailed: "群聊创建失败，请稍后重试。",
    groupCreateHint: "至少选择 2 个已互通消息的联系人，加上你自己组成群聊。",
    groupNeedTwoFriends: "创建群聊至少需要 2 个已互通消息的联系人。",
    groupCreated: "群聊已创建。",
    groupNoFriends: "暂无可邀请联系人。",
    groupDetailsTitle: "群聊详情",
    groupManage: "群管理",
    groupMembersList: "群成员",
    groupInviteMembers: "添加成员",
    groupInviteHint: "群内所有人都可以邀请已互通消息的联系人进群。",
    groupInviteSuccess: "成员已加入群聊。",
    groupInviteFailed: "添加成员失败。",
    groupInvitedBy: "邀请人",
    groupOwner: "群主",
    groupAnnouncement: "群公告",
    groupAnnouncementScroll: "群公告滚动显示",
    groupAvatar: "群头像",
    groupSaveSettings: "保存群设置",
    groupSettingsSaved: "群设置已保存。",
    groupDissolve: "解散群聊",
    groupDissolveConfirm: "确定要解散这个群聊吗？该操作不可恢复。",
    groupDissolved: "群聊已解散。",
    groupNoInviteCandidates: "暂无可添加联系人。",
    callSelectMembers: "选择通话成员",
    callSelectMembersHint: "请先选择要加入本次群组通话的成员。未选择的成员不会收到来电提示。",
    callSelectAll: "全选",
    callClearAll: "清空",
    callSelected: "已选择",
    callNeedMember: "请至少选择一名群成员。",
    callStart: "开始通话",
    callCancel: "取消",
    callNoMembers: "当前群聊没有可选择的成员。"
  },
  en: {
    subtitle: "CN/EN translation · Web/PWA",
    search: "Search by email, phone, or nickname",
    chats: "Chats",
    contacts: "Contacts",
    me: "Me",
    meetings: "Meetings",
    selfLabel: "Me",
    enterToSend: "Enter sends, Ctrl+Enter inserts a new line",
    ctrlEnterToSend: "Ctrl+Enter sends, Enter inserts a new line",
    mobileSendByButton: "On phones: Enter inserts a new line; tap Send to send",
    sendShortcut: "Send shortcut",
    typing: "typing...",
    mentionUser: "Mention",
    meetingComing: "Meeting workspace will be connected in a later version.",
    pasteFileReady: "File read from clipboard. Sending now.",
    screenshotTool: "Screenshot",
    forgotPassword: "Forgot password?",
    auto: "Server translation enabled; verify language coverage and fallback before public testing",
    details: "Details",
    input: "Type a message...",
    attach: "Send image, video, audio, or file",
    uploadingMedia: "Uploading media...",
    mediaUnsupported: "This file is not supported. Please try another file.",
    mediaTooLarge: "The selected file exceeds the allowed size limit.",
    mediaUploadFailed: "Media upload failed. Please try again.",
    mediaOpen: "Open preview",
    mediaClose: "Close preview",
    rotateLeft: "Rotate left",
    rotateRight: "Rotate right",
    videoFitAuto: "Auto",
    videoFitPortrait: "Portrait right",
    videoFitPortraitAlt: "Portrait left",
    videoFitLandscape: "Landscape",
    uploadRetry: "Retry upload",
    uploadCancel: "Cancel upload",
    mediaVideoTooLong: "Video must be 5 minutes or shorter.",
    mediaFiles: "Chat files",
    mediaAll: "All",
    mediaImages: "Images",
    mediaVideos: "Videos",
    mediaAudios: "Audio",
    mediaDocs: "Files",
    mediaEmpty: "No files in this category yet.",
    mediaLoadOlder: "Load older messages",
    mediaLocate: "Show in chat",
    pinConversation: "Pin chat",
    unpinConversation: "Unpin chat",
    deleteChat: "Delete chat",
    chatDeleted: "Chat removed from the list.",
    chatPinned: "Chat pinned.",
    chatUnpinned: "Chat unpinned.",
    voiceRecordStart: "Voice",
    voiceRecordStop: "Send voice",
    voiceRecording: "Recording...",
    voiceRecordFailed: "Voice recording failed. Check microphone permission.",
    voiceTranscript: "Transcribe",
    voiceTranscriptEmpty: "No transcript is available for this voice message.",
    voiceTranscriptHide: "Hide text",
    voicePreviewReady: "Voice is ready. Listen before sending.",
    voiceSendConfirm: "Send",
    voiceCancel: "Cancel",
    messageRevoked: "Message recalled",
    revokeMessage: "Recall",
    revokeFailed: "Recall failed or the time limit has passed.",
    downloadOriginal: "Download original",    settings: "Settings",
    translationTarget: "Translation language",
    displayMode: "Message display",
    speechAccent: "Reading accent",
    speechAccentAuto: "Follow message language",
    originalOnly: "Original",
    translatedOnly: "Translation",
    bilingual: "Bilingual",
    notifications: "New message alerts",
    notificationsHint: "Show a system notification when the chat is not open.",
    notificationSound: "Sound",
    notificationVibration: "Phone vibration",
    notificationPermission: "Allow browser notification permission when prompted.",
    changePasswordTitle: "Change password",
    currentPassword: "Current password",
    newPassword: "New password",
    confirmPassword: "Confirm new password",
    profileSettingsTitle: "Profile settings",
    showSenderNames: "Show sender names in chat",
    profileNickname: "Nickname",
    profileCompany: "Company",
    profileTitle: "Title",
    profileLocation: "Location",
    profileBio: "Bio",
    profileSignature: "Signature",
    profileEmail: "Email",
    profilePhone: "Phone",
    profilePublicId: "ID",
    profilePublic: "Make profile public",
    profileEmailPublic: "Show email publicly",
    profilePhonePublic: "Show phone publicly",
    profileIdHint: "ID can be used to find you. Use 3-32 letters, numbers, dots, underscores, or hyphens. It can be changed once every 6 months.",
    profileRole: "Role",
    profileLanguage: "Interface language",
    profileAvatar: "Avatar",
    uploadAvatar: "Upload avatar",
    cropAvatarTitle: "Crop avatar",
    cropAvatarConfirm: "Use avatar",
    cropAvatarCancel: "Cancel",
    cropAvatarZoom: "Zoom",
    saveProfile: "Save",
    editProfile: "Edit",
    editSignature: "Edit",
    saveSignature: "Save",
    registeredInfo: "Registered info",
    profileSaved: "Profile saved.",
    profileSaveFailed: "Could not save profile.",
    viewContactDetails: "Details",
    contactDetailsTitle: "Contact details",
    contactDetailsEmpty: "This contact has not added public profile information yet.",
    updatePassword: "Update password",
    passwordUpdated: "Password updated.",
    passwordMismatch: "New passwords do not match.",
    passwordTooShort: "New password must be at least 8 characters.",
    passwordChangeFailed: "Could not change password. Check the current password.",
    feedbackTitle: "Feedback",
    feedbackHint: "Tell us what went wrong or what you need next.",
    feedbackPlaceholder: "Describe your feedback...",
    feedbackSend: "Send feedback",
    feedbackSending: "Sending...",
    feedbackSent: "Feedback sent.",
    feedbackTooShort: "Feedback must be at least 5 characters.",
    feedbackFailed: "Could not send feedback. Please try again.",
    feedbackAttach: "Attach issue screenshot",
    feedbackAttachmentReady: "Screenshot attached.",
    feedbackAttachmentRemove: "Remove screenshot",
    versionLabel: "Version",
    adminDashboard: "Admin dashboard",
    adminLoad: "Open admin dashboard",
    adminClose: "Close",
    adminSearchUsers: "Search users",
    adminSearchFeedback: "Search feedback",
    adminSearchConversations: "Search conversations",
    adminNoResults: "No matching results",
    adminUsers: "Users",
    adminConversations: "Conversations",
    adminMessages: "Messages",
    adminOpenFeedback: "Open feedback",
    adminDisabledUsers: "Disabled users",
    adminLoadFailed: "Could not load admin data.",
    adminDisableUser: "Disable",
    adminEnableUser: "Enable",
    adminUserDisabled: "User disabled.",
    adminUserEnabled: "User enabled.",
    adminUserActionFailed: "Could not update user status.",
    adminRecentConversations: "Recent conversations",
    adminMembers: "Members",
    adminMessageCount: "Messages",
    adminFeedbackQueue: "Feedback queue",
    adminMarkInReview: "In review",
    adminMarkResolved: "Resolved",
    adminMarkDismissed: "Dismiss",
    adminFeedbackUpdated: "Feedback status updated.",
    adminFeedbackUpdateFailed: "Could not update feedback status.",
    adminResetPassword: "Reset password",
    adminTempPassword: "Temporary password",
    adminPasswordResetDone: "Temporary password generated.",
    adminPasswordResetFailed: "Could not reset password.",
    adminViewChats: "Chats",
    adminUserDetails: "User details",
    adminUserChats: "User chat history",
    adminChatMessages: "Messages",
    adminNoMessages: "No messages yet",
    adminLoadUserChatsFailed: "Could not load user chat history.",
    friendRequestsTitle: "Contact requests",
    friendsTitle: "Contacts",
    acceptFriend: "Accept",
    rejectFriend: "Reject",
    friendRequestSent: "Chat opened.",
    friendRequestAccepted: "Contact request accepted.",
    friendRequestRejected: "Contact request rejected.",
    blockUser: "Block",
    unblockUser: "Unblock",
    blockedUsersTitle: "Blocked users",
    userBlocked: "User blocked.",
    userUnblocked: "User unblocked.",
    removeFriend: "Remove contact",
    copyShortcut: "Copy shortcut link",
    shortcutCopied: "Shortcut link copied.",
    shortcutUnavailable: "Open the chat once before copying a shortcut link.",
    friendRemoved: "Contact removed.",
    friendRequestFailed: "Could not update contacts. Please try again.",
    addFriend: "Save contact",
    openChat: "Message",
    contactSaved: "Contact saved.",
    profile: "Current user can chat in real time across browser windows.",
    empty: "No matches",
    connected: "Realtime service connected",
    disconnected: "Realtime service disconnected. Check that the API is running.",
    sent: "Message sent through WebSocket.",
    noConversations: "No conversations yet. Search a user in Contacts to start.",
    contactHint: "Search by email or nickname, then start a direct chat.",
    searching: "Searching...",
    english: "English",
    chinese: "Chinese",
    loadingOlder: "Loading...",
    loadOlder: "Load older messages",
    requestFailed: "Request failed. Please try again.",
    searchFailed: "Search failed. Please try again.",
    startConversationFailed: "Could not start the conversation. Please try again.",
    readStateFailed: "Could not update the read state. Please try again.",
    olderMessagesFailed: "Could not load older messages. Please try again.",
    authFailed: "Authentication failed. Check your account and password.",
    sessionExpired: "Your session expired. Please sign in again.",
    newConversation: "New conversation",
    loadingConversations: "Loading conversations...",
    conversationsFailed: "Could not load conversations.",
    emptyConversation: "No messages yet. Send the first message to start.",
    loadingMessages: "Loading messages...",
    messagesFailed: "Could not load messages.",
    noMoreMessages: "No earlier messages.",
    createGroup: "New group",
    groupTitle: "Group name",
    groupMembers: "Select members",
    groupCreateFailed: "Could not create the group. Please try again.",
    groupCreateHint: "Select at least 2 contacts who have exchanged direct messages. You will be included automatically.",
    groupNeedTwoFriends: "Creating a group needs at least 2 contacts who have exchanged direct messages.",
    groupCreated: "Group created.",
    groupNoFriends: "No contacts available to invite.",
    groupDetailsTitle: "Group details",
    groupManage: "Group info",
    groupMembersList: "Members",
    groupInviteMembers: "Add members",
    groupInviteHint: "Any group member can invite contacts who have exchanged direct messages.",
    groupInviteSuccess: "Members added to the group.",
    groupInviteFailed: "Could not add members.",
    groupInvitedBy: "Invited by",
    groupOwner: "Owner",
    groupAnnouncement: "Announcement",
    groupAnnouncementScroll: "Scroll group announcement",
    groupAvatar: "Group avatar",
    groupSaveSettings: "Save group settings",
    groupSettingsSaved: "Group settings saved.",
    groupDissolve: "Dissolve group",
    groupDissolveConfirm: "Dissolve this group? This cannot be undone.",
    groupDissolved: "Group dissolved.",
    groupNoInviteCandidates: "No contacts available to add.",
    callSelectMembers: "Select call members",
    callSelectMembersHint: "Choose who should join this group call. Unselected members will not receive a call prompt.",
    callSelectAll: "Select all",
    callClearAll: "Clear",
    callSelected: "Selected",
    callNeedMember: "Select at least one group member.",
    callStart: "Start call",
    callCancel: "Cancel",
    callNoMembers: "There are no selectable members in this group."
  }
};
const authLanguageOptions: Array<{ code: UiLanguage; label: string; shortLabel: string }> = [
  { code: "zh", label: "中文", shortLabel: "中" },
  { code: "en", label: "English", shortLabel: "EN" },
  { code: "hi", label: "हिन्दी", shortLabel: "हि" }
];

const authCopy: Record<UiLanguage, {
  subtitle: string;
  login: string;
  register: string;
  nickname: string;
  email: string;
  password: string;
  pleaseWait: string;
  createAccount: string;
  authFailed: string;
  language: string;
}> = {
  zh: { subtitle: "登录你的聊天工作区。", login: "登录", register: "注册", nickname: "昵称", email: "邮箱", password: "密码", pleaseWait: "请稍候...", createAccount: "创建账户", authFailed: "认证失败，请检查账号和密码。", language: "界面语言" },
  en: { subtitle: "Sign in to your chat workspace.", login: "Login", register: "Register", nickname: "Nickname", email: "Email", password: "Password", pleaseWait: "Please wait...", createAccount: "Create account", authFailed: "Authentication failed. Check your account and password.", language: "Interface language" },
  hi: { subtitle: "अपने चैट कार्यक्षेत्र में साइन इन करें।", login: "लॉगिन", register: "रजिस्टर", nickname: "उपनाम", email: "ईमेल", password: "पासवर्ड", pleaseWait: "कृपया प्रतीक्षा करें...", createAccount: "खाता बनाएं", authFailed: "प्रमाणीकरण विफल रहा। खाता और पासवर्ड जांचें।", language: "इंटरफेस भाषा" }
};

const appCopy: Record<UiLanguage, typeof copy.en> = {
  ...copy,
  hi: {
    ...copy.en,
    subtitle: "चीनी/अंग्रेजी अनुवाद · Web/PWA",
    search: "ईमेल, फोन या उपनाम से खोजें",
    chats: "चैट",
    contacts: "संपर्क",
    me: "मैं",
    meetings: "मीटिंग",
    selfLabel: "मैं",
    enterToSend: "Enter भेजे, Ctrl+Enter नई पंक्ति",
    ctrlEnterToSend: "Ctrl+Enter भेजे, Enter नई पंक्ति",
    mobileSendByButton: "फोन: Enter नई पंक्ति; भेजने के लिए Send दबाएं",
    sendShortcut: "भेजने का शॉर्टकट",
    typing: "लिख रहे हैं...",
    mentionUser: "@ व्यक्ति",
    meetingComing: "मीटिंग कार्यक्षेत्र अगले संस्करण में जोड़ा जाएगा।",
    pasteFileReady: "क्लिपबोर्ड से फाइल मिली, भेज रहे हैं।",
    screenshotTool: "स्क्रीनशॉट",
    forgotPassword: "पासवर्ड भूल गए?",
    contactDetailsTitle: "संपर्क विवरण",
    contactDetailsEmpty: "इस संपर्क ने अभी सार्वजनिक प्रोफाइल जानकारी नहीं जोड़ी है।",
    copyShortcut: "शॉर्टकट लिंक कॉपी करें",
    shortcutCopied: "शॉर्टकट लिंक कॉपी किया गया।",
    shortcutUnavailable: "शॉर्टकट लिंक कॉपी करने से पहले एक बार चैट खोलें।",    details: "विवरण",
    input: "संदेश लिखें...",
    settings: "सेटिंग्स",
    translationTarget: "अनुवाद भाषा",
    displayMode: "संदेश प्रदर्शन",
    speechAccent: "पढ़ने का उच्चारण",
    speechAccentAuto: "संदेश भाषा के अनुसार",
    originalOnly: "मूल",
    translatedOnly: "अनुवाद",
    bilingual: "द्विभाषी",
    profileLanguage: "इंटरफेस भाषा",
    profileSettingsTitle: "प्रोफाइल सेटिंग्स",
    showSenderNames: "चैट में भेजने वाले का नाम दिखाएं",
    profileNickname: "उपनाम",
    profileCompany: "कंपनी",
    profileTitle: "पद",
    profileLocation: "स्थान",
    profileBio: "व्यक्तिगत परिचय",
    profileSignature: "हस्ताक्षर",
    profileEmail: "ईमेल",
    profilePhone: "फोन",
    profilePublicId: "ID",
    profilePublic: "प्रोफाइल सार्वजनिक करें",
    profileEmailPublic: "ईमेल सार्वजनिक दिखाएं",
    profilePhonePublic: "फोन सार्वजनिक दिखाएं",
    profileIdHint: "ID से आपको खोजा जा सकता है। 3-32 अक्षर, संख्या, डॉट, अंडरस्कोर या हाइफ़न इस्तेमाल करें। हर 6 महीने में एक बार बदला जा सकता है।",
    profileAvatar: "अवतार",
    uploadAvatar: "अवतार अपलोड करें",
    cropAvatarTitle: "अवतार काटें",
    cropAvatarConfirm: "अवतार उपयोग करें",
    cropAvatarCancel: "रद्द करें",
    versionLabel: "संस्करण",
    adminClose: "बंद करें",
    addFriend: "संपर्क सहेजें",
    openChat: "संदेश भेजें",
    contactSaved: "संपर्क सहेजा गया।",
    empty: "कोई परिणाम नहीं",
    connected: "रीयलटाइम सेवा जुड़ी है",
    disconnected: "रीयलटाइम सेवा डिस्कनेक्ट है। कृपया API जांचें।",
    noConversations: "अभी कोई बातचीत नहीं। संपर्क में उपयोगकर्ता खोजकर शुरू करें।",
    contactHint: "ईमेल, फोन, उपनाम या ID से खोजें और चैट शुरू करें।",
    searching: "खोज रहे हैं...",
    english: "अंग्रेजी",
    chinese: "चीनी",
    requestFailed: "अनुरोध विफल रहा। कृपया फिर कोशिश करें।",
    searchFailed: "खोज विफल रही। कृपया फिर कोशिश करें।",
    authFailed: authCopy.hi.authFailed,
    sessionExpired: "सत्र समाप्त हो गया है। कृपया फिर लॉगिन करें।",
    loadingConversations: "बातचीत लोड हो रही है...",
    conversationsFailed: "बातचीत लोड नहीं हो सकी।",
    emptyConversation: "अभी कोई संदेश नहीं। पहला संदेश भेजें।",
    loadingMessages: "संदेश लोड हो रहे हैं...",
    messagesFailed: "संदेश लोड नहीं हो सके।",
    noMoreMessages: "इससे पुराने संदेश नहीं हैं।",
    createGroup: "नया समूह",
    groupMembers: "सदस्य चुनें",
    groupDetailsTitle: "समूह विवरण",
    groupManage: "समूह जानकारी",
    groupMembersList: "सदस्य",
    groupInviteMembers: "सदस्य जोड़ें",
    groupOwner: "समूह स्वामी",
    groupAnnouncement: "समूह घोषणा",
    groupAvatar: "समूह अवतार",
    saveProfile: "सहेजें",
    editProfile: "संपादित करें",
    editSignature: "संपादित करें",
    saveSignature: "सहेजें",
    registeredInfo: "पंजीकरण और प्रोफाइल",
    profileSaved: "प्रोफाइल सहेजा गया।",
    profileSaveFailed: "प्रोफाइल सहेजा नहीं जा सका।",
    notifications: "नए संदेश अलर्ट",
    notificationsHint: "जब चैट खुली न हो तो सिस्टम नोटिफिकेशन दिखाएं.",
    notificationSound: "ध्वनि",
    notificationVibration: "फोन वाइब्रेशन",
    notificationPermission: "संकेत मिलने पर ब्राउज़र नोटिफिकेशन अनुमति दें.",
    changePasswordTitle: "पासवर्ड बदलें",
    currentPassword: "वर्तमान पासवर्ड",
    newPassword: "नया पासवर्ड",
    confirmPassword: "नए पासवर्ड की पुष्टि करें",
    updatePassword: "पासवर्ड अपडेट करें",
    passwordUpdated: "पासवर्ड अपडेट हो गया।",
    feedbackTitle: "फीडबैक",
    feedbackSend: "फीडबैक भेजें",
    feedbackSent: "फीडबैक भेजा गया।",
    adminDashboard: "एडमिन डैशबोर्ड",
    adminLoad: "एडमिन डैशबोर्ड खोलें",
    adminSearchUsers: "उपयोगकर्ता खोजें",
    adminSearchFeedback: "फीडबैक खोजें",
    adminSearchConversations: "बातचीत खोजें",
    adminNoResults: "कोई मेल खाता परिणाम नहीं",
    adminUsers: "उपयोगकर्ता",
    adminConversations: "बातचीत",
    adminMessages: "संदेश",
    adminOpenFeedback: "खुला फीडबैक",
    adminDisabledUsers: "अक्षम उपयोगकर्ता",
    adminLoadFailed: "एडमिन डेटा लोड नहीं हो सका।",
    adminDisableUser: "अक्षम करें",
    adminEnableUser: "सक्षम करें",
    adminResetPassword: "पासवर्ड रीसेट",
    adminRecentConversations: "हाल की बातचीत",
    adminMembers: "सदस्य",
    adminMessageCount: "संदेश संख्या",
    adminFeedbackQueue: "फीडबैक कतार",
    adminMarkInReview: "समीक्षा में",
    adminMarkResolved: "हल हुआ",
    adminMarkDismissed: "हटाएं",
    adminUserChats: "उपयोगकर्ता की सभी चैट",
    adminChatMessages: "चैट संदेश",
    adminUserDetails: "उपयोगकर्ता विवरण",
    adminNoMessages: "कोई संदेश नहीं",
    adminViewChats: "चैट देखें",
    adminTempPassword: "अस्थायी पासवर्ड",
    adminPasswordResetDone: "अस्थायी पासवर्ड बन गया।",
    adminPasswordResetFailed: "पासवर्ड रीसेट नहीं हो सका।",
    adminLoadUserChatsFailed: "उपयोगकर्ता चैट इतिहास लोड नहीं हो सका।",
    friendRequestsTitle: "संपर्क अनुरोध",
    friendsTitle: "संपर्क",
    blockUser: "ब्लॉक करें",
    unblockUser: "ब्लॉक हटाएं",
    removeFriend: "संपर्क हटाएं",
    mediaFiles: "चैट फाइलें",
    mediaAll: "सभी",
    mediaImages: "चित्र",
    mediaVideos: "वीडियो",
    mediaAudios: "ऑडियो",
    mediaDocs: "फाइलें",
    downloadOriginal: "मूल फाइल डाउनलोड करें",
    auto: "सर्वर अनुवाद चालू है; सार्वजनिक परीक्षण से पहले भाषा कवरेज और विफलता विकल्प जांचें",
    attach: "चित्र, वीडियो, ऑडियो या फाइल भेजें",
    uploadingMedia: "मीडिया अपलोड हो रहा है...",
    mediaUnsupported: "यह फाइल समर्थित नहीं है। कोई दूसरी फाइल चुनें।",
    mediaTooLarge: "चुनी गई फाइल अनुमत आकार से बड़ी है।",
    mediaUploadFailed: "मीडिया अपलोड विफल रहा। फिर प्रयास करें।",
    mediaOpen: "पूर्वावलोकन खोलें",
    mediaClose: "पूर्वावलोकन बंद करें",
    rotateLeft: "बाईं ओर घुमाएं",
    rotateRight: "दाईं ओर घुमाएं",
    videoFitAuto: "स्वचालित",
    videoFitPortrait: "पोर्ट्रेट दाईं ओर",
    videoFitPortraitAlt: "पोर्ट्रेट बाईं ओर",
    videoFitLandscape: "लैंडस्केप",
    uploadRetry: "अपलोड फिर करें",
    uploadCancel: "अपलोड रद्द करें",
    mediaVideoTooLong: "वीडियो 5 मिनट या उससे छोटा होना चाहिए।",
    mediaEmpty: "इस श्रेणी में अभी कोई सामग्री नहीं है।",
    mediaLoadOlder: "पुराने संदेश लोड करें",
    mediaLocate: "चैट में दिखाएं",
    pinConversation: "चैट पिन करें",
    unpinConversation: "चैट अनपिन करें",
    deleteChat: "चैट हटाएं",
    chatDeleted: "चैट सूची से हटा दी गई।",
    chatPinned: "चैट पिन की गई।",
    chatUnpinned: "चैट अनपिन की गई।",
    voiceRecordStart: "आवाज़ रिकॉर्ड करें",
    voiceRecordStop: "आवाज़ भेजें",
    voiceRecording: "रिकॉर्ड हो रहा है...",
    voiceRecordFailed: "आवाज़ रिकॉर्ड नहीं हुई। माइक्रोफोन अनुमति जांचें।",
    voiceTranscript: "लिखित पाठ बनाएं",
    voiceTranscriptEmpty: "इस आवाज़ संदेश का लिखित पाठ उपलब्ध नहीं है।",
    voiceTranscriptHide: "पाठ छिपाएं",
    voicePreviewReady: "आवाज़ तैयार है। भेजने से पहले सुन लें।",
    voiceSendConfirm: "भेजें",
    voiceCancel: "रद्द करें",
    messageRevoked: "संदेश वापस लिया गया",
    revokeMessage: "वापस लें",
    revokeFailed: "संदेश वापस नहीं लिया जा सका या समय सीमा समाप्त हो गई।",
    profileRole: "भूमिका",
    cropAvatarZoom: "ज़ूम",
    viewContactDetails: "विवरण",
    passwordMismatch: "नए पासवर्ड मेल नहीं खाते।",
    passwordTooShort: "नया पासवर्ड कम से कम 8 अक्षरों का होना चाहिए।",
    passwordChangeFailed: "पासवर्ड नहीं बदला जा सका। वर्तमान पासवर्ड जांचें।",
    feedbackHint: "समस्या या सुझाव बताएं।",
    feedbackPlaceholder: "अपना फीडबैक लिखें...",
    feedbackSending: "भेज रहे हैं...",
    feedbackTooShort: "फीडबैक कम से कम 5 अक्षरों का होना चाहिए।",
    feedbackFailed: "फीडबैक नहीं भेजा जा सका। फिर प्रयास करें।",
    feedbackAttach: "समस्या का स्क्रीनशॉट जोड़ें",
    feedbackAttachmentReady: "स्क्रीनशॉट जोड़ दिया गया।",
    feedbackAttachmentRemove: "स्क्रीनशॉट हटाएं",
    adminUserDisabled: "उपयोगकर्ता अक्षम किया गया।",
    adminUserEnabled: "उपयोगकर्ता सक्षम किया गया।",
    adminUserActionFailed: "उपयोगकर्ता स्थिति अपडेट नहीं हो सकी।",
    adminFeedbackUpdated: "फीडबैक स्थिति अपडेट हुई।",
    adminFeedbackUpdateFailed: "फीडबैक स्थिति अपडेट नहीं हो सकी।",
    acceptFriend: "स्वीकार करें",
    rejectFriend: "अस्वीकार करें",
    friendRequestSent: "चैट खोल दी गई।",
    friendRequestAccepted: "संपर्क अनुरोध स्वीकार किया गया।",
    friendRequestRejected: "संपर्क अनुरोध अस्वीकार किया गया।",
    blockedUsersTitle: "ब्लॉक किए गए उपयोगकर्ता",
    userBlocked: "उपयोगकर्ता ब्लॉक किया गया।",
    userUnblocked: "उपयोगकर्ता का ब्लॉक हटाया गया।",
    friendRemoved: "संपर्क हटा दिया गया।",
    friendRequestFailed: "संपर्क कार्रवाई विफल रही। फिर प्रयास करें।",
    profile: "वर्तमान उपयोगकर्ता कई ब्राउज़र विंडो में रीयलटाइम चैट कर सकता है।",
    sent: "संदेश WebSocket से भेजा गया।",
    loadingOlder: "लोड हो रहा है...",
    loadOlder: "पुराने संदेश लोड करें",
    startConversationFailed: "चैट शुरू नहीं हो सकी। फिर प्रयास करें।",
    readStateFailed: "पढ़े जाने की स्थिति अपडेट नहीं हो सकी।",
    olderMessagesFailed: "पुराने संदेश लोड नहीं हो सके।",
    newConversation: "नई बातचीत",
    groupTitle: "समूह का नाम",
    groupCreateFailed: "समूह नहीं बन सका। फिर प्रयास करें।",
    groupCreateHint: "कम से कम 2 संपर्क चुनें; आपको जोड़कर समूह बनेगा।",
    groupNeedTwoFriends: "समूह बनाने के लिए कम से कम 2 संपर्क चुनें।",
    groupCreated: "समूह बन गया।",
    groupNoFriends: "आमंत्रित करने के लिए कोई संपर्क नहीं है।",
    groupInviteHint: "समूह का कोई भी सदस्य अपने संपर्कों को आमंत्रित कर सकता है।",
    groupInviteSuccess: "सदस्य समूह में जोड़ दिए गए।",
    groupInviteFailed: "सदस्य नहीं जोड़े जा सके।",
    groupInvitedBy: "आमंत्रित करने वाला",
    groupAnnouncementScroll: "समूह घोषणा स्क्रॉल करें",
    groupSaveSettings: "समूह सेटिंग सहेजें",
    groupSettingsSaved: "समूह सेटिंग सहेजी गई।",
    groupDissolve: "समूह समाप्त करें",
    groupDissolveConfirm: "क्या आप इस समूह को समाप्त करना चाहते हैं? इसे वापस नहीं किया जा सकता।",
    groupDissolved: "समूह समाप्त कर दिया गया।",
    groupNoInviteCandidates: "जोड़ने के लिए कोई संपर्क नहीं है।",
    callSelectMembers: "कॉल सदस्य चुनें",
    callSelectMembersHint: "इस समूह कॉल में शामिल सदस्यों को चुनें। न चुने गए सदस्यों को कॉल सूचना नहीं मिलेगी।",
    callSelectAll: "सभी चुनें",
    callClearAll: "चयन साफ करें",
    callSelected: "चुने गए",
    callNeedMember: "कम से कम एक समूह सदस्य चुनें।",
    callStart: "कॉल शुरू करें",
    callCancel: "रद्द करें",
    callNoMembers: "इस समूह में चुनने के लिए कोई सदस्य नहीं है।"
  }
};

const connectionStatusLabels: Record<UiLanguage, Record<ConnectionState, string>> = {
  zh: {
    connected: "实时服务已连接",
    reconnecting: "正在恢复实时连接...",
    offline: "网络已断开，恢复网络后会自动重连。"
  },
  en: {
    connected: "Realtime service connected",
    reconnecting: "Reconnecting to realtime service...",
    offline: "You are offline. Reconnection will start when the network returns."
  },
  hi: {
    connected: "रीयलटाइम सेवा जुड़ी है",
    reconnecting: "रीयलटाइम सेवा फिर जुड़ रही है...",
    offline: "आप ऑफलाइन हैं। नेटवर्क लौटने पर फिर कनेक्ट होगा।"
  }
};
const callLabels = {
  zh: {
    audioCall: "语音通话",
    videoCall: "视频通话",
    incomingAudio: "语音来电",
    incomingVideo: "视频来电",
    accept: "接听",
    reject: "拒绝",
    end: "挂断",
    mute: "静音",
    unmute: "取消静音",
    cameraOff: "关闭摄像头",
    cameraOn: "打开摄像头",
    calling: "正在呼叫...",
    connecting: "正在连接...",
    inCall: "通话中",
    localUser: "我",
    noRemote: "等待对方加入",
    permissionFailed: "无法打开麦克风或摄像头，请检查浏览器权限。",
    notSupported: "此浏览器不支持语音/视频通话。",
    callEnded: "通话已结束。",
    callRejected: "对方已拒绝通话。",
    callBusy: "对方正在通话中。"
  },
  en: {
    audioCall: "Voice call",
    videoCall: "Video call",
    incomingAudio: "Incoming voice call",
    incomingVideo: "Incoming video call",
    accept: "Accept",
    reject: "Decline",
    end: "End",
    mute: "Mute",
    unmute: "Unmute",
    cameraOff: "Camera off",
    cameraOn: "Camera on",
    calling: "Calling...",
    connecting: "Connecting...",
    inCall: "In call",
    localUser: "Me",
    noRemote: "Waiting for others to join",
    permissionFailed: "Could not open microphone or camera. Check browser permissions.",
    notSupported: "This browser does not support voice/video calls.",
    callEnded: "Call ended.",
    callRejected: "The call was declined.",
    callBusy: "The other side is already in a call."
  },
  hi: {
    audioCall: "वॉइस कॉल",
    videoCall: "वीडियो कॉल",
    incomingAudio: "इनकमिंग वॉइस कॉल",
    incomingVideo: "इनकमिंग वीडियो कॉल",
    accept: "स्वीकार करें",
    reject: "अस्वीकार करें",
    end: "समाप्त करें",
    mute: "म्यूट",
    unmute: "अनम्यूट",
    cameraOff: "कैमरा बंद",
    cameraOn: "कैमरा चालू",
    calling: "कॉल कर रहे हैं...",
    connecting: "कनेक्ट हो रहा है...",
    inCall: "कॉल में",
    localUser: "मैं",
    noRemote: "दूसरे व्यक्ति के जुड़ने की प्रतीक्षा",
    permissionFailed: "माइक्रोफोन या कैमरा नहीं खुला। ब्राउज़र अनुमति जांचें।",
    notSupported: "यह ब्राउज़र वॉइस/वीडियो कॉल का समर्थन नहीं करता।",
    callEnded: "कॉल समाप्त हुई।",
    callRejected: "कॉल अस्वीकार की गई।",
    callBusy: "दूसरी ओर पहले से कॉल चल रही है।"
  }
} as const;
const messageStatusLabels: Record<UiLanguage, Record<MessageSendStatus, string>> = {
  zh: {
    sending: "发送中",
    sent: "已发送",
    delivered: "已送达",
    read: "已读",
    failed: "发送失败"
  },
  en: {
    sending: "Sending",
    sent: "Sent",
    delivered: "Delivered",
    read: "Read",
    failed: "Failed"
  },
  hi: {
    sending: "भेज रहे हैं",
    sent: "भेजा गया",
    delivered: "पहुंच गया",
    read: "पढ़ा गया",
    failed: "भेजना विफल"
  }
};
const messageActionLabels: Record<UiLanguage, { retry: string; reply: string; copy: string; copied: string; copyOriginal: string; copyTranslation: string; copiedOriginal: string; copiedTranslation: string; copyFailed: string; translate: string; translating: string; translated: string; translateFailed: string; translationUnavailable: string; retryTranslation: string; translationThrottled: string; readOriginal: string; readTranslation: string; speechUnavailable: string; revokeBatch: string; revokeBatchDone: string; remind: string; reminderSet: string; reminderDue: string }> = {
  zh: { retry: "重发", reply: "引用", copy: "复制", copied: "已复制", copyOriginal: "复制原文", copyTranslation: "复制译文", copiedOriginal: "原文已复制", copiedTranslation: "译文已复制", copyFailed: "复制失败", translate: "重新翻译", translating: "翻译中", translated: "翻译已更新", translateFailed: "翻译失败，请稍后重试", translationUnavailable: "翻译失败，已显示原文。", retryTranslation: "重试翻译", translationThrottled: "翻译请求太频繁，请稍后再试。", readOriginal: "原文朗读", readTranslation: "译文朗读", speechUnavailable: "当前浏览器不支持朗读。", revokeBatch: "撤回本次发送", revokeBatchDone: "本次发送已撤回", remind: "提醒", reminderSet: "提醒已设置", reminderDue: "消息提醒" },
  en: { retry: "Retry", reply: "Quote", copy: "Copy", copied: "Copied", copyOriginal: "Copy original", copyTranslation: "Copy translation", copiedOriginal: "Original copied", copiedTranslation: "Translation copied", copyFailed: "Copy failed", translate: "Translate / refresh", translating: "Translating", translated: "Translation updated", translateFailed: "Translation failed. Please try again.", translationUnavailable: "Translation failed. Original text is shown.", retryTranslation: "Retry translation", translationThrottled: "Translation requests are too frequent. Please try again shortly.", readOriginal: "Read original", readTranslation: "Read translation", speechUnavailable: "This browser does not support text to speech.", revokeBatch: "Recall this send batch", revokeBatchDone: "Send batch recalled", remind: "Remind", reminderSet: "Reminder set", reminderDue: "Message reminder" },
  hi: { retry: "फिर भेजें", reply: "उद्धृत करें", copy: "कॉपी", copied: "कॉपी हो गया", copyOriginal: "मूल कॉपी करें", copyTranslation: "अनुवाद कॉपी करें", copiedOriginal: "मूल कॉपी हो गया", copiedTranslation: "अनुवाद कॉपी हो गया", copyFailed: "कॉपी विफल", translate: "अनुवाद / रीफ्रेश", translating: "अनुवाद हो रहा है", translated: "अनुवाद अपडेट हुआ", translateFailed: "अनुवाद विफल। कृपया फिर कोशिश करें।", translationUnavailable: "अनुवाद विफल। मूल पाठ दिखाया गया है।", retryTranslation: "अनुवाद फिर करें", translationThrottled: "अनुवाद अनुरोध बहुत अधिक हैं। थोड़ी देर बाद कोशिश करें।", readOriginal: "मूल पढ़ें", readTranslation: "अनुवाद पढ़ें", speechUnavailable: "यह ब्राउज़र टेक्स्ट-टू-स्पीच का समर्थन नहीं करता।", revokeBatch: "इस भेजे समूह को वापस लें", revokeBatchDone: "भेजा समूह वापस लिया गया", remind: "रिमाइंडर", reminderSet: "रिमाइंडर सेट हो गया", reminderDue: "संदेश रिमाइंडर" }
};

function createBrowserId() {
  const browserCrypto = globalThis.crypto;
  if (typeof browserCrypto?.randomUUID === "function") {
    return browserCrypto.randomUUID();
  }
  if (typeof browserCrypto?.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    browserCrypto.getRandomValues(bytes);
    return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

const localHostnames = new Set(["localhost", "127.0.0.1", "::1"]);

function isLocalNetworkHost(hostname: string) {
  return (
    localHostnames.has(hostname) ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("10.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  );
}

function isLocalNetworkUrl(value: string) {
  try {
    return isLocalNetworkHost(new URL(value).hostname);
  } catch {
    return false;
  }
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function getConfiguredPublicUrl(value?: string) {
  if (!value) return "";
  const trimmed = value.trim();
  if (trimmed === "same-origin") {
    if (typeof window === "undefined") return "";
    if (window.location.port === "3101") return `${window.location.protocol}//${window.location.hostname}:4100`;
    return window.location.origin;
  }
  const normalized = normalizeBaseUrl(trimmed);
  if (typeof window === "undefined") return normalized;
  if (isLocalNetworkHost(window.location.hostname)) return normalized;
  return isLocalNetworkUrl(normalized) ? "" : normalized;
}

function getApiUrl() {
  const configured = getConfiguredPublicUrl(process.env.NEXT_PUBLIC_API_URL);
  if (configured) return configured;
  if (typeof window === "undefined") return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100";
  if (window.location.protocol === "https:" && window.location.port === "3443") return window.location.origin;
  if (localHostnames.has(window.location.hostname)) return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100";
  // Public deployments are served through a same-origin reverse proxy. When
  // the configured build-time URL points at a private/local address, keep API
  // requests on the page origin so Nginx can route them through the tunnel.
  return window.location.origin;
}
function normalizeMediaUrl(url: string | undefined) {
  if (!url || typeof window === "undefined") return url;
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.pathname.startsWith("/media/") && isLocalNetworkHost(parsed.hostname)) {
      // The HTTPS gateway proxies /media on 3443. A direct Web connection on
      // 3101 does not, so media must use the API port instead of the Next.js
      // origin or downloads will return a Web 404.
      const mediaOrigin = window.location.port === "3101" ? new URL(getApiUrl()).origin : window.location.origin;
      return `${mediaOrigin}${parsed.pathname}${parsed.search}`;
    }
    const api = new URL(getApiUrl());
    if (isLocalNetworkHost(parsed.hostname) && parsed.port === api.port) {
      parsed.protocol = api.protocol;
      parsed.hostname = api.hostname;
      parsed.port = api.port;
      return parsed.toString();
    }
  } catch {
    return url;
  }
  return url;
}


function mediaUrlWithFileName(url: string | null | undefined, fileName?: string | null, forceDownload = false) {
  const normalized = normalizeMediaUrl(url ?? undefined) ?? url;
  if (!normalized || typeof window === "undefined") return normalized ?? "";
  if (normalized.startsWith("blob:") || normalized.startsWith("data:")) return normalized;
  try {
    const parsed = new URL(normalized, window.location.origin);
    if (fileName) parsed.searchParams.set("name", fileName);
    if (forceDownload) parsed.searchParams.set("download", "1");
    return parsed.toString();
  } catch {
    return normalized;
  }
}

function mediaPreviewUrl(message: { mediaUrl?: string | null; body?: string | null }) {
  return mediaUrlWithFileName(message.mediaUrl, message.body, false);
}

function mediaThumbnailUrl(message: { mediaUrl?: string | null; thumbnailUrl?: string | null; body?: string | null }) {
  return message.thumbnailUrl ? mediaUrlWithFileName(message.thumbnailUrl, message.body, false) : mediaPreviewUrl(message);
}

function videoThumbnailUrl(message: { thumbnailUrl?: string | null; body?: string | null }) {
  return message.thumbnailUrl ? mediaUrlWithFileName(message.thumbnailUrl, message.body, false) : undefined;
}

function mediaDownloadUrl(message: { mediaUrl?: string | null; body?: string | null }) {
  return mediaUrlWithFileName(message.mediaUrl, message.body, true);
}

function isZipArchive(message: { mediaUrl?: string | null; body?: string | null }) {
  const name = ((message.body || message.mediaUrl || "").split("?")[0] ?? "").toLowerCase();
  return name.endsWith(".zip");
}

function archivePreviewPath(message: { mediaUrl?: string | null; body?: string | null }) {
  const normalized = normalizeMediaUrl(message.mediaUrl ?? undefined) ?? message.mediaUrl;
  if (!normalized || typeof window === "undefined") return "";
  try {
    const parsed = new URL(normalized, window.location.origin);
    parsed.pathname = parsed.pathname.replace("/media/files/", "/media/archives/");
    if (message.body) parsed.searchParams.set("name", message.body);
    parsed.searchParams.delete("download");
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return "";
  }
}
function isUiLanguage(value: string | null): value is UiLanguage {
  return value === "zh" || value === "en" || value === "hi";
}

function getStoredUiLanguage(): UiLanguage {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem("glimpse.uiLanguage");
  return isUiLanguage(stored) ? stored : "en";
}

function getBackendUserLanguage(language: UiLanguage): UserLanguage {
  return language === "zh" ? "zh" : "en";
}

function nextUiLanguage(language: UiLanguage): UiLanguage {
  if (language === "zh") return "en";
  if (language === "en") return "hi";
  return "zh";
}

function uiLabel(language: UiLanguage, labels: Record<UiLanguage, string>) {
  return labels[language];
}

const translationLanguageDisplayNames: Partial<Record<TranslationLanguage, Record<UiLanguage, string>>> = {
  zh: { zh: "中文", en: "Chinese", hi: "चीनी" },
  en: { zh: "英文", en: "English", hi: "अंग्रेजी" },
  hi: { zh: "印地语", en: "Hindi", hi: "हिन्दी" },
  ar: { zh: "阿拉伯语", en: "Arabic", hi: "अरबी" },
  bn: { zh: "孟加拉语", en: "Bengali", hi: "बंगाली" },
  de: { zh: "德语", en: "German", hi: "जर्मन" },
  es: { zh: "西班牙语", en: "Spanish", hi: "स्पेनिश" },
  fr: { zh: "法语", en: "French", hi: "फ्रेंच" },
  id: { zh: "印尼语", en: "Indonesian", hi: "इंडोनेशियाई" },
  it: { zh: "意大利语", en: "Italian", hi: "इतालवी" },
  ja: { zh: "日语", en: "Japanese", hi: "जापानी" },
  ko: { zh: "韩语", en: "Korean", hi: "कोरियाई" },
  ms: { zh: "马来语", en: "Malay", hi: "मलय" },
  nl: { zh: "荷兰语", en: "Dutch", hi: "डच" },
  pt: { zh: "葡萄牙语", en: "Portuguese", hi: "पुर्तगाली" },
  ru: { zh: "俄语", en: "Russian", hi: "रूसी" },
  ta: { zh: "泰米尔语", en: "Tamil", hi: "तमिल" },
  te: { zh: "泰卢固语", en: "Telugu", hi: "तेलुगु" },
  th: { zh: "泰语", en: "Thai", hi: "थाई" },
  tr: { zh: "土耳其语", en: "Turkish", hi: "तुर्की" },
  ur: { zh: "乌尔都语", en: "Urdu", hi: "उर्दू" },
  vi: { zh: "越南语", en: "Vietnamese", hi: "वियतनामी" }
};

function translationLanguageLabelForUi(item: { code: TranslationLanguage; label: string; nativeLabel: string }, language: UiLanguage) {
  return `${translationLanguageDisplayNames[item.code]?.[language] ?? item.label} / ${item.nativeLabel}`;
}
function adminPermissionLabel(option: { label: string; zhLabel: string; hiLabel?: string }, language: UiLanguage) {
  if (language === "zh") return option.zhLabel;
  if (language === "hi") return option.hiLabel ?? option.label;
  return option.label;
}

const adminSettingGroupLabels: Record<string, Record<UiLanguage, string>> = {
  Bootstrap: { zh: "启动配置", en: "Bootstrap", hi: "स्टार्टअप कॉन्फिग" },
  Admin: { zh: "管理员", en: "Admin", hi: "एडमिन" },
  Translation: { zh: "翻译", en: "Translation", hi: "अनुवाद" },
  Aliyun: { zh: "阿里云", en: "Aliyun", hi: "अलीयुन" },
  "Aliyun Model Studio": { zh: "阿里云百炼", en: "Aliyun Model Studio", hi: "अलीयुन मॉडल स्टूडियो" },
  "Public URLs": { zh: "公网地址", en: "Public URLs", hi: "सार्वजनिक URL" },
  Speech: { zh: "语音", en: "Speech", hi: "वॉइस" },
  Storage: { zh: "存储", en: "Storage", hi: "स्टोरेज" },
  Email: { zh: "邮件", en: "Email", hi: "ईमेल" },
  SMS: { zh: "短信", en: "SMS", hi: "SMS" }
};

const adminSettingLabelOverrides: Record<string, Record<UiLanguage, string>> = {
  DATABASE_URL: { zh: "数据库 URL", en: "Database URL", hi: "डेटाबेस URL" },
  JWT_ACCESS_SECRET: { zh: "JWT 访问密钥", en: "JWT access secret", hi: "JWT एक्सेस सीक्रेट" },
  JWT_ACCESS_TTL: { zh: "JWT 登录有效期", en: "JWT access TTL", hi: "JWT एक्सेस अवधि" },
  ADMIN_EMAILS: { zh: "启动管理员邮箱", en: "Bootstrap admin emails", hi: "स्टार्टअप एडमिन ईमेल" },
  TRANSLATION_PROVIDER: { zh: "翻译提供方", en: "Translation provider", hi: "अनुवाद सेवा" },
  BAIDU_TRANSLATE_APP_ID: { zh: "百度翻译 AppID", en: "Baidu translate AppID", hi: "Baidu Translate AppID" },
  BAIDU_TRANSLATE_SECRET: { zh: "百度翻译密钥", en: "Baidu translate secret", hi: "Baidu Translate सीक्रेट" },
  BAIDU_TRANSLATE_API_KEY: { zh: "百度云 API Key", en: "Baidu cloud API Key", hi: "Baidu Cloud API Key" },
  BAIDU_TRANSLATE_SECRET_KEY: { zh: "百度云 Secret Key", en: "Baidu cloud Secret Key", hi: "Baidu Cloud Secret Key" },
  TRANSLATION_CACHE_TTL_SECONDS: { zh: "翻译缓存时间", en: "Translation cache TTL", hi: "अनुवाद कैश समय" },
  TRANSLATION_CACHE_MAX_ENTRIES: { zh: "翻译缓存最大条数", en: "Translation cache max entries", hi: "अनुवाद कैश अधिकतम संख्या" },
  TRANSLATION_MAX_REQUESTS_PER_MINUTE: { zh: "翻译频率限制", en: "Translation rate limit", hi: "अनुवाद दर सीमा" },
  ALIYUN_DASHSCOPE_API_KEY: { zh: "DashScope API Key", en: "DashScope API Key", hi: "DashScope API Key" },
  ALIYUN_DASHSCOPE_BASE_URL: { zh: "DashScope 基础 URL", en: "DashScope base URL", hi: "DashScope बेस URL" },
  VOICE_TRANSCRIBE_PROVIDER: { zh: "语音转文字服务", en: "Voice transcription provider", hi: "वॉइस-टू-टेक्स्ट सेवा" },
  ALIYUN_ASR_MODEL: { zh: "阿里云 ASR 模型", en: "Aliyun ASR model", hi: "Aliyun ASR मॉडल" },
  PUBLIC_MEDIA_BASE_URL: { zh: "公网媒体基础 URL", en: "Public media base URL", hi: "सार्वजनिक मीडिया बेस URL" },
  TTS_PROVIDER: { zh: "朗读服务", en: "Text-to-speech provider", hi: "रीड-अलाउड सेवा" },
  ALIYUN_TTS_API_KEY: { zh: "百炼朗读 API Key", en: "Bailian TTS API Key", hi: "Bailian TTS API Key" },
  ALIYUN_TTS_BASE_URL: { zh: "百炼朗读 Base URL", en: "Bailian TTS Base URL", hi: "Bailian TTS Base URL" },
  ALIYUN_TTS_MODEL: { zh: "百炼朗读模型", en: "Bailian TTS model", hi: "Bailian TTS मॉडल" },
  ALIYUN_TTS_VOICE: { zh: "百炼朗读音色", en: "Bailian TTS voice", hi: "Bailian TTS वॉइस" },
  DOUBAO_API_KEY: { zh: "豆包 API Key", en: "Doubao API Key", hi: "Doubao API Key" },
  DOUBAO_TTS_API_KEY: { zh: "豆包 TTS API Key", en: "Doubao TTS API Key", hi: "Doubao TTS API Key" },
  DOUBAO_ASR_API_KEY: { zh: "豆包 ASR API Key", en: "Doubao ASR API Key", hi: "Doubao ASR API Key" },
  DOUBAO_ASR_MODEL: { zh: "豆包 ASR Resource-Id", en: "Doubao ASR Resource-Id", hi: "Doubao ASR Resource-Id" },
  DOUBAO_TTS_MODEL: { zh: "豆包 TTS Resource-Id", en: "Doubao TTS Resource-Id", hi: "Doubao TTS Resource-Id" },
  DOUBAO_TTS_VOICE: { zh: "豆包朗读音色", en: "Doubao TTS voice", hi: "Doubao TTS वॉइस" },
  CHAT_STORAGE: { zh: "聊天存储", en: "Chat storage", hi: "चैट स्टोरेज" },
  MEDIA_STORAGE_DIR: { zh: "媒体存储目录", en: "Media storage directory", hi: "मीडिया स्टोरेज डायरेक्टरी" },
  NEXT_PUBLIC_API_URL: { zh: "公开 API URL", en: "Public API URL", hi: "सार्वजनिक API URL" },
  NEXT_PUBLIC_SOCKET_URL: { zh: "公开 Socket URL", en: "Public socket URL", hi: "सार्वजनिक Socket URL" },
  PUBLIC_WEB_URL: { zh: "公开 Web URL", en: "Public web URL", hi: "सार्वजनिक Web URL" },
  SMTP_HOST: { zh: "SMTP 主机", en: "SMTP host", hi: "SMTP होस्ट" },
  SMTP_PORT: { zh: "SMTP 端口", en: "SMTP port", hi: "SMTP पोर्ट" },
  SMTP_USER: { zh: "SMTP 用户", en: "SMTP user", hi: "SMTP उपयोगकर्ता" },
  SMTP_PASSWORD: { zh: "SMTP 密码", en: "SMTP password", hi: "SMTP पासवर्ड" },
  SMS_PROVIDER: { zh: "短信服务商", en: "SMS provider", hi: "SMS सेवा" },
  SMS_ACCESS_KEY_ID: { zh: "短信 AccessKey", en: "SMS access key", hi: "SMS access key" },
  SMS_ACCESS_KEY_SECRET: { zh: "短信 Secret", en: "SMS secret", hi: "SMS secret" },
  APP_SLOGANS_JSON: { zh: "标题栏标语 JSON", en: "Title slogan JSON", hi: "शीर्षक नारा JSON" },
  APP_SLOGAN_ENABLED_IDS: { zh: "启用标语 ID", en: "Enabled slogan IDs", hi: "सक्रिय नारा ID" }
};

function adminSettingGroupLabel(group: string, language: UiLanguage) {
  return adminSettingGroupLabels[group]?.[language] ?? group;
}

function adminSettingLabel(item: AdminSettingRow, language: UiLanguage) {
  return adminSettingLabelOverrides[item.key]?.[language] ?? item.label;
}

const adminSettingDescriptionOverrides: Record<string, Record<UiLanguage, string>> = {
  DATABASE_URL: { zh: "数据库连接地址。应用必须先靠 .env 连上数据库后，后台配置才能读取。", en: "Database connection URL. The app must connect through .env before admin settings can be read.", hi: "डेटाबेस कनेक्शन URL। एडमिन सेटिंग पढ़ने से पहले ऐप को .env से डेटाबेस से जुड़ना होगा।" },
  JWT_ACCESS_SECRET: { zh: "登录令牌签名密钥。修改后需要重启，并会影响已登录设备。", en: "Signing secret for login tokens. Restart is required and signed-in devices are affected.", hi: "लॉगिन टोकन साइन करने की कुंजी। बदलने के बाद रीस्टार्ट आवश्यक है और लॉगिन डिवाइस प्रभावित होंगे।" },
  JWT_ACCESS_TTL: { zh: "登录有效期，例如 7d。", en: "Login validity period, for example 7d.", hi: "लॉगिन वैधता अवधि, जैसे 7d।" },
  ADMIN_EMAILS: { zh: "启动级管理员邮箱白名单。新管理员建议在后台账户权限中维护。", en: "Bootstrap administrator email allowlist. Manage new administrators in account permissions.", hi: "स्टार्टअप एडमिन ईमेल अनुमति सूची। नए एडमिन को खाते की अनुमति में प्रबंधित करें।" },
  TRANSLATION_PROVIDER: { zh: "翻译提供方：严格使用后台所选引擎，不自动回退或改用其他引擎。", en: "Translation uses only the selected backend provider, without automatic provider fallback.", hi: "अनुवाद केवल चुने गए बैकएंड प्रदाता का उपयोग करता है; कोई स्वचालित फ़ॉलबैक नहीं।" },
  BAIDU_TRANSLATE_APP_ID: { zh: "百度通用翻译 AppID。", en: "Baidu general translation AppID.", hi: "Baidu सामान्य अनुवाद AppID।" },
  BAIDU_TRANSLATE_SECRET: { zh: "百度通用翻译密钥。", en: "Baidu general translation secret.", hi: "Baidu सामान्य अनुवाद सीक्रेट।" },
  BAIDU_TRANSLATE_API_KEY: { zh: "百度智能云机器翻译 API Key。", en: "Baidu Cloud machine translation API Key.", hi: "Baidu Cloud मशीन अनुवाद API Key।" },
  BAIDU_TRANSLATE_SECRET_KEY: { zh: "百度智能云机器翻译 Secret Key。", en: "Baidu Cloud machine translation Secret Key.", hi: "Baidu Cloud मशीन अनुवाद Secret Key।" },
  TRANSLATION_CACHE_TTL_SECONDS: { zh: "翻译缓存秒数。", en: "Translation cache duration in seconds.", hi: "अनुवाद कैश अवधि, सेकंड में।" },
  TRANSLATION_CACHE_MAX_ENTRIES: { zh: "翻译缓存最大条数。", en: "Maximum number of translation cache entries.", hi: "अनुवाद कैश की अधिकतम संख्या।" },
  TRANSLATION_MAX_REQUESTS_PER_MINUTE: { zh: "每分钟最多翻译请求数。", en: "Maximum translation requests per minute.", hi: "प्रति मिनट अधिकतम अनुवाद अनुरोध।" },
  CHAT_STORAGE: { zh: "聊天存储方式，当前建议 prisma。", en: "Chat storage mode. Prisma is currently recommended.", hi: "चैट स्टोरेज मोड। वर्तमान में prisma सुझाया गया है।" },
  MEDIA_STORAGE_DIR: { zh: "本地媒体上传目录。修改后新上传文件使用新目录。", en: "Local media upload directory. New uploads use the new directory after change.", hi: "स्थानीय मीडिया अपलोड डायरेक्टरी। बदलने के बाद नई फाइलें नए स्थान पर जाएंगी।" },
  NEXT_PUBLIC_API_URL: { zh: "前端访问 API 的公网地址。前端构建变量通常需要重启/重新构建。", en: "Public API URL used by the frontend. Frontend build variables usually require restart/rebuild.", hi: "फ्रंटएंड द्वारा उपयोग किया जाने वाला सार्वजनिक API URL। आम तौर पर रीस्टार्ट/रीबिल्ड आवश्यक है।" },
  NEXT_PUBLIC_SOCKET_URL: { zh: "前端实时服务地址。前端构建变量通常需要重启/重新构建。", en: "Realtime socket URL used by the frontend. Frontend build variables usually require restart/rebuild.", hi: "फ्रंटएंड रीयलटाइम सेवा URL। आम तौर पर रीस्टार्ट/रीबिल्ड आवश्यक है।" },
  PUBLIC_WEB_URL: { zh: "外部访问网页地址，用于通知或分享。", en: "Public web URL for notifications or sharing.", hi: "नोटिफिकेशन या शेयर के लिए सार्वजनिक Web URL।" },
  SMTP_HOST: { zh: "邮件服务器地址。", en: "Mail server host.", hi: "मेल सर्वर पता।" },
  SMTP_PORT: { zh: "邮件服务器端口。", en: "Mail server port.", hi: "मेल सर्वर पोर्ट।" },
  SMTP_USER: { zh: "邮件发送账号。", en: "Mail sender account.", hi: "मेल भेजने वाला खाता।" },
  SMTP_PASSWORD: { zh: "邮件发送密码。", en: "Mail sender password.", hi: "मेल भेजने का पासवर्ड।" },
  SMS_PROVIDER: { zh: "短信服务商。", en: "SMS provider.", hi: "SMS सेवा प्रदाता।" },
  SMS_ACCESS_KEY_ID: { zh: "短信服务 AccessKey。", en: "SMS service AccessKey.", hi: "SMS सेवा AccessKey।" },
  SMS_ACCESS_KEY_SECRET: { zh: "短信服务 Secret。", en: "SMS service Secret.", hi: "SMS सेवा Secret।" },
  TTS_PROVIDER: { zh: "严格使用后台所选朗读引擎：browser、doubao 或支持印地语的 aliyun_bailian，不自动切换。", en: "Read-aloud strictly uses the selected provider: browser, doubao, or Hindi-capable aliyun_bailian.", hi: "रीड-अलाउड केवल चुने गए प्रदाता का उपयोग करता है: browser, doubao या हिंदी समर्थित aliyun_bailian।" },
  ALIYUN_TTS_BASE_URL: { zh: "百炼 OpenAI-compatible Base URL；留空时使用通用 DashScope 地址。", en: "Bailian OpenAI-compatible Base URL; the shared DashScope URL is used when empty.", hi: "Bailian OpenAI-compatible Base URL; खाली होने पर साझा DashScope URL उपयोग होगा।" },
  ALIYUN_TTS_MODEL: { zh: "使用支持印地语音频输出的 Qwen3.5-Omni 模型。", en: "Use a Qwen3.5-Omni model with Hindi audio output.", hi: "हिंदी ऑडियो आउटपुट वाला Qwen3.5-Omni मॉडल उपयोग करें।" },
  ALIYUN_TTS_VOICE: { zh: "Qwen3.5-Omni 输出音色，默认 Tina。", en: "Qwen3.5-Omni output voice; default Tina.", hi: "Qwen3.5-Omni आउटपुट वॉइस; डिफ़ॉल्ट Tina।" },
  DOUBAO_BASE_URL: { zh: "通用豆包语音 Base URL。", en: "General Doubao speech Base URL.", hi: "सामान्य Doubao speech Base URL।" },
  DOUBAO_TTS_BASE_URL: { zh: "豆包朗读专用 HTTP POST 地址。不要填 WebSocket stream 地址。", en: "Dedicated Doubao TTS HTTP POST URL. Do not use a WebSocket stream URL.", hi: "Doubao TTS HTTP POST URL। WebSocket stream URL न भरें।" },
  DOUBAO_TTS_VOICE: { zh: "默认豆包朗读音色/voice_type。", en: "Default Doubao read-aloud voice_type.", hi: "डिफॉल्ट Doubao read-aloud voice_type।" },
  DOUBAO_TTS_VOICES_JSON: { zh: "豆包音色列表 JSON。留空时使用内置常用音色。", en: "Doubao voice list JSON. Built-in voices are used when empty.", hi: "Doubao वॉइस सूची JSON। खाली होने पर अंतर्निहित वॉइस उपयोग होगी।" },
  APP_SLOGANS_JSON: { zh: "标题栏动态标语 JSON。格式为 [{id, zh, en, hi, enabled}]。留空时使用内置 20 条标语。", en: "Dynamic title slogan JSON. Format: [{id, zh, en, hi, enabled}]. Built-in 20 slogans are used when empty.", hi: "डायनामिक शीर्षक नारा JSON। प्रारूप: [{id, zh, en, hi, enabled}]। खाली होने पर 20 अंतर्निहित नारे उपयोग होंगे।" },
  APP_SLOGAN_ENABLED_IDS: { zh: "启用的标语 ID。可填写逗号分隔 ID 或 JSON 数组；留空表示启用全部标语。", en: "Enabled slogan IDs. Use comma-separated IDs or a JSON array; empty means all slogans are enabled.", hi: "सक्रिय नारा ID। कॉमा से अलग ID या JSON array भरें; खाली होने पर सभी नारे सक्रिय रहेंगे।" }
};

function adminSettingDescription(item: AdminSettingRow, language: UiLanguage) {
  return adminSettingDescriptionOverrides[item.key]?.[language] ?? item.description;
}

function adminSettingSourceLabel(source: string, language: UiLanguage) {
  if (source === "admin") return uiLabel(language, { zh: "后台", en: "Admin", hi: "एडमिन" });
  if (source === "env") return ".env";
  if (source === "default") return uiLabel(language, { zh: "默认", en: "Default", hi: "डिफॉल्ट" });
  return uiLabel(language, { zh: "未设置", en: "Empty", hi: "खाली" });
}

function getStoredAuth() {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem("glimpse.auth");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthResponse;
  } catch {
    window.localStorage.removeItem("glimpse.auth");
    return null;
  }
}

function storeAuth(auth: AuthResponse) {
  window.localStorage.setItem("glimpse.auth", JSON.stringify(auth));
}

function avatarPreviewStorageKey(userId: string) {
  return `glimpse.avatarPreview.${userId}`;
}

function conversationPinsStorageKey(userId: string) {
  return `glimpse.conversationPins.${userId}`;
}

function workspaceViewStorageKey(userId: string) {
  return `glimpse.workspaceView.${userId}`;
}

function readWorkspaceView(userId: string): PersistedWorkspaceView | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(workspaceViewStorageKey(userId)) ?? "null") as Partial<PersistedWorkspaceView> | null;
    if (!parsed) return null;
    const validTabs: Tab[] = ["chats", "contacts", "meetings", "moments", "me"];
    const tab = validTabs.includes(parsed.tab as Tab) ? parsed.tab as Tab : "chats";
    const conversationId = typeof parsed.conversationId === "string" ? parsed.conversationId : "";
    const mobilePane = parsed.mobilePane === "chat" ? "chat" : "list";
    return { tab, conversationId, mobilePane };
  } catch {
    return null;
  }
}

function writeWorkspaceView(userId: string, view: PersistedWorkspaceView) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(workspaceViewStorageKey(userId), JSON.stringify(view));
}

function messageRemindersStorageKey(userId: string) {
  return `glimpse.messageReminders.${userId}`;
}

function conversationHiddenStorageKey(userId: string) {
  return `glimpse.conversationHidden.${userId}`;
}

function hiddenContactsStorageKey(userId: string) {
  return `glimpse.hiddenContacts.${userId}`;
}

function hiddenMessagesStorageKey(userId: string) {
  return `glimpse.hiddenMessages.${userId}`;
}

function ttsVoiceStorageKey(provider: string, userId: string) {
  return `glimpse.ttsVoice.${userId || "anonymous"}.${provider || "default"}`;
}

function getStoredTtsVoice(provider: string, userId: string) {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(ttsVoiceStorageKey(provider, userId))?.trim() ?? "";
}

function stickerFavoritesStorageKey(userId: string) {
  return `glimpse.stickerFavorites.${userId}`;
}

function readStoredIdSet(key: string) {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function writeStoredIdSet(key: string, values: Set<string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(Array.from(values)));
}

function getStoredAvatarPreview(userId: string) {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(avatarPreviewStorageKey(userId)) ?? "";
}

function storeAvatarPreview(userId: string, value: string) {
  if (typeof window === "undefined") return;
  if (value) window.localStorage.setItem(avatarPreviewStorageKey(userId), value);
  else window.localStorage.removeItem(avatarPreviewStorageKey(userId));
}


type AvatarCropOffset = { x: number; y: number };
type AvatarCropImageSize = { width: number; height: number };

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clampAvatarCropOffset(offset: AvatarCropOffset, scale: number, imageSize: AvatarCropImageSize, viewportSize: number): AvatarCropOffset {
  if (!imageSize.width || !imageSize.height || !viewportSize) return { x: 0, y: 0 };
  const baseScale = Math.max(viewportSize / imageSize.width, viewportSize / imageSize.height);
  const renderedWidth = imageSize.width * baseScale * scale;
  const renderedHeight = imageSize.height * baseScale * scale;
  const maxX = Math.max(0, (renderedWidth - viewportSize) / 2);
  const maxY = Math.max(0, (renderedHeight - viewportSize) / 2);
  return {
    x: clampNumber(offset.x, -maxX, maxX),
    y: clampNumber(offset.y, -maxY, maxY)
  };
}

function distanceBetweenPoints(a: AvatarCropOffset, b: AvatarCropOffset) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpointBetweenPoints(a: AvatarCropOffset, b: AvatarCropOffset): AvatarCropOffset {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
function clearStoredAuth() {
  window.localStorage.removeItem("glimpse.auth");
}

function getSocketUrl() {
  const configured = getConfiguredPublicUrl(process.env.NEXT_PUBLIC_SOCKET_URL);
  if (configured) return configured;
  if (typeof window === "undefined") return process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:4100";
  if (window.location.protocol === "https:" && window.location.port === "3443") return window.location.origin;
  if (localHostnames.has(window.location.hostname)) return process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:4100";
  // Socket.IO shares the public reverse-proxy origin with the Web app.
  return window.location.origin;
}

function formatMessageTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfMessageDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  if (startOfMessageDay === startOfToday) return time;
  const datePart = date.getFullYear() === now.getFullYear()
    ? new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short" }).format(date)
    : new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(date);
  return `${datePart} ${time}`;
}

function formatConversationTime(value?: string) {
  if (!value) return "New";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "New";

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfMessageDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDiff = Math.round((startOfToday - startOfMessageDay) / 86400000);

  if (dayDiff === 0) return new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit" }).format(date);
  if (dayDiff === 1) return "Yesterday";
  if (date.getFullYear() === now.getFullYear()) return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short" }).format(date);
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function mediaUploadAbortError() {
  const error = new Error("Media upload cancelled.");
  error.name = "AbortError";
  return error;
}
function isPreviewableDocument(message: { mediaUrl?: string | null; body?: string | null }) {
  const name = ((message.body || message.mediaUrl || "").split("?")[0] ?? "").toLowerCase();
  return [".pdf", ".txt", ".md", ".csv", ".json", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".odt", ".ods", ".odp", ".rtf", ".wps", ".et", ".dps", ".dxf", ".dwg", ".exb", ".caxa"].some((extension) => name.endsWith(extension));
}

function documentPreviewPath(message: { mediaUrl?: string | null; body?: string | null }) {
  const normalized = normalizeMediaUrl(message.mediaUrl ?? undefined) ?? message.mediaUrl;
  if (!normalized || typeof window === "undefined") return "";
  try {
    const parsed = new URL(normalized, window.location.origin);
    parsed.pathname = parsed.pathname.replace("/media/files/", "/media/previews/");
    if (message.body) parsed.searchParams.set("name", message.body);
    parsed.searchParams.delete("download");
    return `${parsed.pathname}${parsed.search}`;
  } catch { return ""; }
}

function documentConvertPath(message: { mediaUrl?: string | null; body?: string | null }) {
  const normalized = normalizeMediaUrl(message.mediaUrl ?? undefined) ?? message.mediaUrl;
  if (!normalized || typeof window === "undefined") return "";
  try {
    const parsed = new URL(normalized, window.location.origin);
    parsed.pathname = parsed.pathname.replace("/media/files/", "/media/documents/").replace(/\/$/, "") + "/convert";
    if (message.body) parsed.searchParams.set("name", message.body);
    parsed.searchParams.delete("download");
    return `${parsed.pathname}${parsed.search}`;
  } catch { return ""; }
}

function documentTranslatePath(message: { mediaUrl?: string | null; body?: string | null }) {
  const normalized = normalizeMediaUrl(message.mediaUrl ?? undefined) ?? message.mediaUrl;
  if (!normalized || typeof window === "undefined") return "";
  try {
    const parsed = new URL(normalized, window.location.origin);
    parsed.pathname = parsed.pathname.replace("/media/files/", "/assistant/documents/").replace(/\/$/, "") + "/translate";
    if (message.body) parsed.searchParams.set("name", message.body);
    parsed.searchParams.delete("download");
    return `${parsed.pathname}${parsed.search}`;
  } catch { return ""; }
}

function translatableDocumentLabel(message?: { body?: string | null } | null) {
  const extension = (message?.body || "").split(".").pop()?.toLowerCase();
  if (extension === "doc" || extension === "docx") return "Word";
  if (extension === "xls" || extension === "xlsx") return "Excel";
  if (extension === "pdf") return "PDF";
  return "";
}

function formatFileSize(bytes?: number) {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${units[unitIndex]}`;
}

function readFileAsBase64(file: File, signal?: AbortSignal) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    let settled = false;
    const cleanup = () => signal?.removeEventListener("abort", abort);
    const abort = () => {
      if (settled) return;
      settled = true;
      if (reader.readyState === FileReader.LOADING) reader.abort();
      cleanup();
      reject(mediaUploadAbortError());
    };
    reader.onload = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(String(reader.result ?? ""));
    };
    reader.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(reader.error ?? new Error("File read failed."));
    };
    reader.onabort = abort;
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    reader.readAsDataURL(file);
  });
}

function fileExtension(fileName: string) {
  return fileName.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
}

const CAD_FILE_EXTENSIONS = new Set([".dxf", ".dwg", ".exb", ".caxa"]);

function isCadDrawingFileName(fileName?: string | null) {
  return CAD_FILE_EXTENSIONS.has(fileExtension(fileName ?? ""));
}

function mediaTypeFromFile(file: File): "image" | "video" | "audio" | "file" {
  const mimeType = file.type.toLowerCase();
  const extension = fileExtension(file.name);
  // DWG/DXF commonly use image/vnd.* MIME types, but they are downloadable
  // documents, not browser-decodable image messages.
  if (CAD_FILE_EXTENSIONS.has(extension)) return "file";
  if (mimeType.startsWith("image/") || [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(extension)) return "image";
  if (mimeType.startsWith("video/") || [".mp4", ".mov", ".m4v", ".webm", ".mkv", ".3gp", ".3gpp", ".mpeg", ".mpg", ".mpe", ".rm", ".rmvb", ".avi", ".wmv", ".flv", ".f4v", ".ts", ".mts", ".m2ts", ".vob", ".ogv"].includes(extension)) return "video";
  if (mimeType.startsWith("audio/") || [".mp3", ".m4a", ".aac", ".wav", ".webm", ".ogg", ".flac"].includes(extension)) return "audio";
  return "file";
}

function isAlbumMediaMessage(message: Pick<MessagePayload, "type" | "mediaUrl" | "revokedAt">) {
  return (message.type === "image" || message.type === "video") && Boolean(message.mediaUrl) && !message.revokedAt;
}

function uploadMimeTypeForFile(file: File) {
  const extension = fileExtension(file.name);
  if (extension === ".dxf") return "image/vnd.dxf";
  if (extension === ".dwg") return "image/vnd.dwg";
  if ([".exb", ".caxa"].includes(extension)) return "application/x-caxa-exb";
  if (file.type) return file.type;
  if ([".mp4", ".m4v"].includes(extension)) return "video/mp4";
  if ([".mpeg", ".mpg", ".mpe"].includes(extension)) return "video/mpeg";
  if ([".rm", ".rmvb"].includes(extension)) return "application/vnd.rn-realmedia";
  if (extension === ".avi") return "video/x-msvideo";
  if (extension === ".wmv") return "video/x-ms-wmv";
  if ([".flv", ".f4v"].includes(extension)) return "video/x-flv";
  if ([".ts", ".mts", ".m2ts"].includes(extension)) return "video/mp2t";
  if (extension === ".vob") return "video/dvd";
  if (extension === ".ogv") return "video/ogg";
  if (extension === ".mov") return "video/quicktime";
  if (extension === ".webm") return "video/webm";
  if ([".3gp", ".3gpp"].includes(extension)) return "video/3gpp";
  if (extension === ".mkv") return "video/x-matroska";
  if (extension === ".mp3") return "audio/mpeg";
  if (extension === ".m4a") return "audio/mp4";
  if (extension === ".wav") return "audio/wav";
  if (extension === ".ogg") return "audio/ogg";
  if (extension === ".pdf") return "application/pdf";
  if (extension === ".txt") return "text/plain";
  if (extension === ".doc") return "application/msword";
  if (extension === ".docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (extension === ".xls") return "application/vnd.ms-excel";
  if (extension === ".xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (extension === ".ppt") return "application/vnd.ms-powerpoint";
  if (extension === ".pptx") return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  return "application/octet-stream";
}
function createImageThumbnail(file: File) {
  return new Promise<File | null>((resolve) => {
    if (!file.type.startsWith("image/")) {
      resolve(null);
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const maxSide = 720;
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(url);
        resolve(null);
        return;
      }
      context.drawImage(image, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          if (!blob) {
            resolve(null);
            return;
          }
          const stem = file.name.replace(/\.[^.]+$/, "") || "image";
          resolve(new File([blob], `${stem}-thumb.webp`, { type: "image/webp" }));
        },
        "image/webp",
        0.86
      );
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    image.src = url;
  });
}

function createImagePreview(file: File) {
  return new Promise<File | null>((resolve) => {
    if (!file.type.startsWith("image/") && mediaTypeFromFile(file) !== "image") {
      resolve(null);
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const maxSide = 1440;
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(url);
        resolve(null);
        return;
      }
      context.drawImage(image, 0, 0, width, height);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        if (!blob) {
          resolve(null);
          return;
        }
        const stem = file.name.replace(/\.[^.]+$/, "") || "image";
        resolve(new File([blob], `${stem}-preview.webp`, { type: "image/webp" }));
      }, "image/webp", 0.9);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    image.src = url;
  });
}

function createVideoThumbnail(file: File) {
  return new Promise<File | null>((resolve) => {
    if (!file.type.startsWith("video/") && mediaTypeFromFile(file) !== "video") {
      resolve(null);
      return;
    }
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    let settled = false;
    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
    };
    const finish = (value: File | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const capture = () => {
      if (settled || video.videoWidth <= 0 || video.videoHeight <= 0) {
        if (!settled) finish(null);
        return;
      }
      const maxSide = 720;
      const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
      const width = Math.max(1, Math.round(video.videoWidth * scale));
      const height = Math.max(1, Math.round(video.videoHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        finish(null);
        return;
      }
      context.drawImage(video, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (!blob) {
          finish(null);
          return;
        }
        const stem = file.name.replace(/\.[^.]+$/, "") || "video";
        finish(new File([blob], `${stem}-preview.webp`, { type: "image/webp" }));
      }, "image/webp", 0.8);
    };
    video.onloadedmetadata = () => {
      if (Number.isFinite(video.duration) && video.duration > 0.2) {
        video.currentTime = Math.min(0.5, video.duration / 2);
      } else {
        capture();
      }
    };
    video.onseeked = capture;
    video.onerror = () => finish(null);
    video.src = url;
    video.load();
  });
}

function createCompressedVideo(file: File) {
  return new Promise<File | null>((resolve) => {
    if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
      resolve(null);
      return;
    }
    const video = document.createElement("video");
    const sourceUrl = URL.createObjectURL(file);
    const captureVideo = video as HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream };
    const mimeType = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
      .find((candidate) => MediaRecorder.isTypeSupported(candidate));
    if (!mimeType) {
      URL.revokeObjectURL(sourceUrl);
      resolve(null);
      return;
    }

    let recorder: MediaRecorder | null = null;
    let outputStream: MediaStream | null = null;
    let frameRequest = 0;
    let settled = false;
    let stopping = false;
    const cleanup = () => {
      if (frameRequest) window.cancelAnimationFrame(frameRequest);
      video.pause();
      video.removeAttribute("src");
      video.load();
      outputStream?.getTracks().forEach((track) => track.stop());
      URL.revokeObjectURL(sourceUrl);
    };
    const finish = (value: File | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const stopRecording = () => {
      if (stopping) return;
      stopping = true;
      if (frameRequest) window.cancelAnimationFrame(frameRequest);
      if (recorder?.state === "recording") recorder.stop();
      else finish(null);
    };

    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      if (settled) return;
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (width <= 0 || height <= 0 || typeof HTMLCanvasElement === "undefined") {
        finish(null);
        return;
      }
      const maxSide = 1280;
      const scale = Math.min(1, maxSide / Math.max(width, height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext("2d");
      if (!context || typeof canvas.captureStream !== "function") {
        finish(null);
        return;
      }
      outputStream = canvas.captureStream(24);
      const sourceStream = captureVideo.captureStream?.() ?? captureVideo.mozCaptureStream?.();
      sourceStream?.getAudioTracks().forEach((track) => outputStream?.addTrack(track));
      const chunks: Blob[] = [];
      try {
        recorder = new MediaRecorder(outputStream, {
          mimeType,
          videoBitsPerSecond: 2_500_000,
          audioBitsPerSecond: 128_000
        });
      } catch {
        finish(null);
        return;
      }
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => finish(null);
      recorder.onstop = () => {
        if (chunks.length === 0) {
          finish(null);
          return;
        }
        const stem = file.name.replace(/\.[^.]+$/, "") || "video";
        finish(new File([new Blob(chunks, { type: mimeType })], `${stem}-preview.webm`, { type: mimeType }));
      };
      video.onended = stopRecording;
      const drawFrame = () => {
        if (settled || stopping) return;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        if (video.ended || (Number.isFinite(video.duration) && video.currentTime >= video.duration - 0.05)) {
          stopRecording();
          return;
        }
        frameRequest = window.requestAnimationFrame(drawFrame);
      };
      recorder.start(250);
      void video.play().then(drawFrame).catch(() => finish(null));
    };
    video.onerror = () => finish(null);
    video.src = sourceUrl;
    video.load();
  });
}

function readVideoDuration(file: File) {
  return new Promise<number>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const duration = video.duration;
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(duration) ? duration : 0);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read video duration."));
    };
    video.src = url;
  });
}

function uploadMediaWithProgress(file: File, token: string, onProgress: (progress: number) => void, signal?: AbortSignal) {
  return readFileAsBase64(file, signal).then(
    (dataBase64) =>
      new Promise<UploadedMediaResponse>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        let settled = false;
        const cleanup = () => signal?.removeEventListener("abort", abort);
        const abort = () => {
          if (settled) return;
          settled = true;
          if (xhr.readyState !== XMLHttpRequest.DONE) xhr.abort();
          cleanup();
          reject(mediaUploadAbortError());
        };
        xhr.open("POST", `${getApiUrl()}/media/upload`);
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.upload.onprogress = (event) => {
          if (settled) return;
          if (!event.lengthComputable) return;
          onProgress(Math.max(1, Math.min(99, Math.round((event.loaded / event.total) * 100))));
        };
        xhr.onload = () => {
          if (settled) return;
          settled = true;
          cleanup();
          let data: unknown = {};
          try {
            data = JSON.parse(xhr.responseText || "{}");
          } catch {
            data = {};
          }
          if (xhr.status >= 200 && xhr.status < 300 && typeof data === "object" && data !== null && "media" in data) {
            onProgress(100);
            const media = (data as { media: UploadedMediaResponse }).media;
            resolve({ ...media, url: normalizeMediaUrl(media.url) ?? media.url });
            return;
          }
          reject(new Error(apiErrorMessage(data, "Media upload failed. Please try again.")));
        };
        xhr.onerror = () => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(new Error("Media upload failed. Please try again."));
        };
        xhr.onabort = abort;
        if (signal?.aborted) {
          abort();
          return;
        }
        signal?.addEventListener("abort", abort, { once: true });
        xhr.send(JSON.stringify({ fileName: file.name, mimeType: uploadMimeTypeForFile(file), size: file.size, dataBase64 }));
      })
  );
}

function parseLocationMessage(body?: string): LocationMessagePayload | null {
  if (!body?.startsWith(LOCATION_MESSAGE_PREFIX)) return null;
  try {
    const parsed = JSON.parse(body.slice(LOCATION_MESSAGE_PREFIX.length)) as Partial<LocationMessagePayload>;
    const latitude = Number(parsed.latitude);
    const longitude = Number(parsed.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
    return {
      latitude,
      longitude,
      name: typeof parsed.name === "string" ? parsed.name.slice(0, 120) : undefined,
      address: typeof parsed.address === "string" ? parsed.address.slice(0, 240) : undefined
    };
  } catch {
    return null;
  }
}

function encodeLocationMessage(location: LocationMessagePayload) {
  return `${LOCATION_MESSAGE_PREFIX}${JSON.stringify(location)}`;
}

function locationMessageTitle(location: LocationMessagePayload) {
  return location.name?.trim() || location.address?.trim() || `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`;
}

function locationMapUrl(location: LocationMessagePayload) {
  const lat = location.latitude.toFixed(6);
  const lng = location.longitude.toFixed(6);
  const label = encodeURIComponent(locationMessageTitle(location));
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}&layers=M`;
}

function encodeStickerMessage(sticker: StickerDefinition) {
  return STICKER_MESSAGE_PREFIX + JSON.stringify({ id: sticker.id });
}

function parseStickerMessage(body: string | undefined) {
  if (!body?.startsWith(STICKER_MESSAGE_PREFIX)) return null;
  try {
    const parsed = JSON.parse(body.slice(STICKER_MESSAGE_PREFIX.length)) as { id?: string };
    return BUILT_IN_STICKERS.find((item) => item.id === parsed.id) ?? null;
  } catch {
    return null;
  }
}

function stickerLabel(sticker: StickerDefinition, language: UiLanguage) {
  return language === "zh" ? sticker.zh : language === "hi" ? sticker.hi : sticker.en;
}

function stickerCategoryLabel(category: (typeof STICKER_CATEGORIES)[number], language: UiLanguage) {
  return language === "zh" ? category.zh : language === "hi" ? category.hi : category.en;
}

function parseTranslationEditNotice(body?: string) {
  if (!body?.startsWith(TRANSLATION_EDIT_NOTICE_PREFIX)) return null;
  try {
    const parsed = JSON.parse(body.slice(TRANSLATION_EDIT_NOTICE_PREFIX.length)) as { editorName?: unknown; targetMessageId?: unknown };
    if (typeof parsed.editorName !== "string" || !parsed.editorName.trim() || typeof parsed.targetMessageId !== "string" || !parsed.targetMessageId) return null;
    return { editorName: parsed.editorName.trim().slice(0, 120), targetMessageId: parsed.targetMessageId };
  } catch {
    return null;
  }
}

function translationEditNoticeLabel(editorName: string, language: UiLanguage) {
  return uiLabel(language, {
    zh: `${editorName} 已修改翻译内容`,
    en: `${editorName} edited the translation`,
    hi: `${editorName} ने अनुवाद सामग्री संशोधित की`
  });
}

function mediaPreviewLabel(message: MessagePayload) {
  const translationEditNotice = message.type === "text" ? parseTranslationEditNotice(message.body) : null;
  if (translationEditNotice) return translationEditNoticeLabel(translationEditNotice.editorName, "zh");
  const sticker = message.type === "text" ? parseStickerMessage(message.body) : null;
  if (sticker) return sticker.imageUrl ? "[Sticker]" : `[Sticker] ${[sticker.emoji, sticker.en].filter(Boolean).join(" ")}`;
  const location = message.type === "text" ? parseLocationMessage(message.body) : null;
  if (location) return `[Location] ${locationMessageTitle(location)}`;
  if (message.type === "image") return message.body ? `[Image] ${message.body}` : "[Image]";
  if (message.type === "video") return message.body ? `[Video] ${message.body}` : "[Video]";
  if (message.type === "audio") return message.body ? `[Audio] ${message.body}` : "[Audio]";
  if (message.type === "file") return message.body ? `[File] ${message.body}` : "[File]";
  return message.body ?? "";
}

function extractErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function localizeNoticeMessage(message: string, language: string) {
  const normalized = message.trim();
  if (!normalized) return message;
  if (language === "hi") {
    const exactHi: Record<string, string> = {
      "Request failed. Please try again.": "अनुरोध विफल रहा। कृपया फिर कोशिश करें।",
      "Request timed out. Check the public API URL / ngrok tunnel and try again.": "अनुरोध का समय समाप्त हो गया। कृपया API पता जांचकर फिर कोशिश करें।",
      "Invalid email or password.": "ईमेल या पासवर्ड गलत है।",
      "Invalid or expired token.": "लॉगिन समाप्त हो गया है। कृपया फिर लॉगिन करें।",
      "Missing bearer token.": "लॉगिन समाप्त हो गया है। कृपया फिर लॉगिन करें।",
      "Account is disabled.": "खाता बंद कर दिया गया है।",
      "Current password is incorrect.": "वर्तमान पासवर्ड गलत है।",
      "Message not found.": "संदेश नहीं मिला।",
      "User was not found.": "उपयोगकर्ता नहीं मिला।",
      "Message forwarded.": "संदेश फॉरवर्ड हो गया।"
    };
    if (exactHi[normalized]) return exactHi[normalized];
    if (/failed/i.test(normalized)) return "कार्रवाई विफल रही। कृपया फिर कोशिश करें।";
    if (/not found/i.test(normalized)) return "संबंधित डेटा नहीं मिला।";
    if (/unauthorized|forbidden/i.test(normalized)) return "अनुमति नहीं है या लॉगिन समाप्त हो गया है।";
    return message;
  }
  if (language !== "zh") return message;
  const exact: Record<string, string> = {
    "Request failed. Please try again.": "\u8bf7\u6c42\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5\u3002",
    "Request timed out. Check the public API URL / ngrok tunnel and try again.": "\u8bf7\u6c42\u8d85\u65f6\uff0c\u8bf7\u68c0\u67e5\u516c\u7f51 API \u5730\u5740\u6216 ngrok \u901a\u9053\u540e\u91cd\u8bd5\u3002",
    "Invalid email or password.": "\u90ae\u7bb1\u6216\u5bc6\u7801\u9519\u8bef\u3002",
    "Invalid or expired token.": "\u767b\u5f55\u5df2\u5931\u6548\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55\u3002",
    "Missing bearer token.": "\u767b\u5f55\u5df2\u5931\u6548\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55\u3002",
    "Account is disabled.": "\u8d26\u6237\u5df2\u88ab\u7981\u7528\u3002",
    "Current password is incorrect.": "\u5f53\u524d\u5bc6\u7801\u4e0d\u6b63\u786e\u3002",
    "New password must be different from the current password.": "\u65b0\u5bc6\u7801\u4e0d\u80fd\u4e0e\u5f53\u524d\u5bc6\u7801\u76f8\u540c\u3002",
    "ID must be 3-32 characters and can only contain letters, numbers, dot, underscore, or hyphen.": "ID \u9700\u8981 3-32 \u4f4d\uff0c\u53ea\u80fd\u5305\u542b\u5b57\u6bcd\u3001\u6570\u5b57\u3001\u70b9\u3001\u4e0b\u5212\u7ebf\u6216\u77ed\u6a2a\u7ebf\u3002",
    "You must be friends before starting a direct conversation.": "\u9700\u8981\u5148\u4fdd\u5b58\u4e3a\u8054\u7cfb\u4eba\u624d\u80fd\u5f00\u59cb\u79c1\u804a\u3002",
    "This user is blocked.": "\u8be5\u7528\u6237\u5df2\u88ab\u62c9\u9ed1\u3002",
    "Cannot block yourself.": "\u4e0d\u80fd\u62c9\u9ed1\u81ea\u5df1\u3002",
    "User was not found.": "\u672a\u627e\u5230\u8be5\u7528\u6237\u3002",
    "Blocked user was not found.": "\u672a\u627e\u5230\u5df2\u62c9\u9ed1\u7528\u6237\u3002",
    "You are already friends.": "\u5df2\u7ecf\u662f\u8054\u7cfb\u4eba\u3002",
    "Friendship was not found.": "\u672a\u627e\u5230\u8054\u7cfb\u4eba\u5173\u7cfb\u3002",
    "Pending friend request was not found.": "\u672a\u627e\u5230\u5f85\u5904\u7406\u7684\u597d\u53cb\u8bf7\u6c42\u3002",
    "Message not found.": "\u672a\u627e\u5230\u8be5\u6d88\u606f\u3002",
    "Cannot send messages to a blocked user.": "\u65e0\u6cd5\u5411\u5df2\u62c9\u9ed1\u7528\u6237\u53d1\u9001\u6d88\u606f\u3002",
    "Group conversation was not found.": "\u672a\u627e\u5230\u8be5\u7fa4\u804a\u3002",
    "One or more group members were not found.": "\u4e00\u4e2a\u6216\u591a\u4e2a\u7fa4\u6210\u5458\u672a\u627e\u5230\u3002",
    "One or more invitees were not found.": "\u4e00\u4e2a\u6216\u591a\u4e2a\u88ab\u9080\u8bf7\u4eba\u672a\u627e\u5230\u3002",
    "This file type is not allowed.": "\u4e0d\u652f\u6301\u8be5\u6587\u4ef6\u7c7b\u578b\u3002",
    "Media file was not found.": "\u672a\u627e\u5230\u8be5\u5a92\u4f53\u6587\u4ef6\u3002",
    "Feedback was not found.": "\u672a\u627e\u5230\u8be5\u53cd\u9988\u3002",
    "You cannot reset your own password here.": "\u4e0d\u80fd\u5728\u8fd9\u91cc\u91cd\u7f6e\u81ea\u5df1\u7684\u5bc6\u7801\u3002",
    "You cannot disable your own account.": "\u4e0d\u80fd\u7981\u7528\u81ea\u5df1\u7684\u8d26\u6237\u3002",
    "Message forwarded.": "\u6d88\u606f\u5df2\u8f6c\u53d1\u3002"
  };
  if (exact[normalized]) return exact[normalized];
  if (/Public ID/i.test(normalized) && /already|taken|exists|unique/i.test(normalized)) return "ID \u5df2\u88ab\u4f7f\u7528\uff0c\u8bf7\u66f4\u6362\u540e\u91cd\u8bd5\u3002";
  if (/183|6 months|six months|change/i.test(normalized) && /ID/i.test(normalized)) return "ID \u534a\u5e74\u5185\u53ea\u80fd\u4fee\u6539\u4e00\u6b21\u3002";
  if (/failed/i.test(normalized)) return "\u64cd\u4f5c\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5\u3002";
  if (/not found/i.test(normalized)) return "\u672a\u627e\u5230\u76f8\u5173\u6570\u636e\u3002";
  if (/unauthorized|forbidden/i.test(normalized)) return "\u6ca1\u6709\u6743\u9650\u6216\u767b\u5f55\u5df2\u5931\u6548\u3002";
  return message;
}

function apiErrorMessage(data: unknown, fallback: string) {
  if (typeof data === "object" && data && "message" in data) {
    const message = (data as { message?: unknown }).message;
    if (Array.isArray(message)) return message.map(String).join("; ");
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}
function requestTimeoutMessage() {
  return "Request timed out. Check the public API URL / ngrok tunnel and try again.";
}

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit, timeoutMs = 15000) {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort();
  if (init?.signal?.aborted) controller.abort();
  else init?.signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError" && timedOut) {
      throw new Error(requestTimeoutMessage());
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
    init?.signal?.removeEventListener("abort", abortFromCaller);
  }
}
function mapConversation(summary: ConversationSummary): Conversation {
  return {
    id: summary.id,
    name: summary.title,
    preview: summary.latestMessage ?? "Start a secure conversation.",
    time: formatConversationTime(summary.latestMessageAt),
    latestMessageAt: summary.latestMessageAt,
    unread: summary.unreadCount,
    avatarUrl: normalizeMediaUrl(summary.avatarUrl),
    announcement: summary.announcement ?? undefined,
    announcementScroll: summary.announcementScroll ?? true,
    ownerId: summary.ownerId ?? undefined,
    memberCount: summary.memberCount,
    otherUser: summary.otherUser ? { ...summary.otherUser, avatarUrl: normalizeMediaUrl(summary.otherUser.avatarUrl ?? summary.avatarUrl) } : undefined,
    online: summary.online ?? summary.otherUser?.online ?? false,
    type: summary.type === "group" ? "group" : "single",
    language: "en"
  };
}


function conversationSortTime(conversation: Conversation) {
  const value = conversation.latestMessageAt ? new Date(conversation.latestMessageAt).getTime() : 0;
  return Number.isFinite(value) ? value : 0;
}

function compareConversations(left: Conversation, right: Conversation, pinnedConversationIds: Set<string>) {
  const pinnedDelta = Number(pinnedConversationIds.has(right.id)) - Number(pinnedConversationIds.has(left.id));
  if (pinnedDelta !== 0) return pinnedDelta;
  return conversationSortTime(right) - conversationSortTime(left);
}

async function apiJson<T>(path: string, token: string, init?: RequestInit, timeoutMs = 15000): Promise<T> {
  const response = await fetchWithTimeout(`${getApiUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {})
    }
  }, timeoutMs);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(apiErrorMessage(data, "Request failed. Please try again."));
  }
  return data as T;
}

const speechAccentOptions: Array<{ code: SpeechAccent; label: string }> = [
  { code: "auto", label: "Auto / 跟随消息语言" },
  { code: "en-IN", label: "English - India" },
  { code: "en-US", label: "English - United States" },
  { code: "en-GB", label: "English - United Kingdom" },
  { code: "zh-CN", label: "中文普通话 - 中国大陆" },
  { code: "zh-TW", label: "中文普通话 - 台湾" },
  { code: "hi-IN", label: "Hindi - India" },
  { code: "ta-IN", label: "Tamil - India" },
  { code: "te-IN", label: "Telugu - India" },
  { code: "bn-IN", label: "Bengali - India" },
  { code: "ar-SA", label: "Arabic" },
  { code: "ur-PK", label: "Urdu" },
  { code: "ja-JP", label: "Japanese" },
  { code: "ko-KR", label: "Korean" }
];
type AdminSettingRow = {
  key: string;
  label: string;
  group: string;
  description: string;
  value: string;
  maskedValue?: string;
  hasValue: boolean;
  sensitive?: boolean;
  restartRequired?: boolean;
  bootstrapOnly?: boolean;
  source: string;
  updatedAt?: string | null;
  activeOptionLabel?: string | null;
  options?: Array<{ value: string; label: string; description?: string }>;
};

type AdminToolHealthItem = {
  id: string;
  label: string;
  category: string;
  provider?: string | null;
  active: boolean;
  mode: "real" | "configuration" | "client";
  status: "healthy" | "error";
  elapsedMs: number;
  message: string;
};

type AdminToolHealth = { checkedAt: string; tools: AdminToolHealthItem[] };

function mergeBrowserTtsHealth(data: AdminToolHealth): AdminToolHealth {
  if (typeof window === "undefined") return data;
  const available = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  const voiceCount = available ? window.speechSynthesis.getVoices().length : 0;
  return {
    ...data,
    tools: data.tools.map((item) => item.id !== "tts_browser" ? item : {
      ...item,
      status: available ? "healthy" : "error",
      elapsedMs: 0,
      message: available
        ? `Browser speech synthesis API is available; ${voiceCount} voice(s) are currently enumerated. The system default voice remains usable when the list is empty.`
        : "Browser speech synthesis API is unavailable in this browser."
    })
  };
}

type TtsVoiceConfig = { voiceType: string; voices: Array<{ value: string; label: string; description?: string }> };
type TtsRuntimeConfig = {
  provider: "browser" | "doubao" | "aliyun_bailian" | string;
  doubao: TtsVoiceConfig;
  aliyun: TtsVoiceConfig & { model: string };
};

type AdminOverview = {
  users: number;
  disabledUsers: number;
  conversations: number;
  messages: number;
  openFeedback: number;
  onlineUsers: number;
  activeConnections: number;
  storage: {
    projectRoot: string;
    projectBytes: number;
    freeBytes: number;
    totalBytes: number;
    measuredAt: string;
  };
};

type AdminDashboardTab = "overview" | "settings" | "slogans" | "users" | "conversations";

type AdminUserRow = {
  id: string;
  email?: string | null;
  phone?: string | null;
  publicId?: string | null;
  publicIdUpdatedAt?: string | null;
  profilePublic?: boolean | null;
  profileEmailPublic?: boolean | null;
  profilePhonePublic?: boolean | null;
  nickname: string;
  avatarUrl?: string | null;
  profileCompany?: string | null;
  profileTitle?: string | null;
  profileLocation?: string | null;
  profileBio?: string | null;
  profileSignature?: string | null;
  language: string;
  role: string;
  isSuperAdmin?: boolean;
  adminPermissions?: string[];
  disabledAt?: string | null;
  createdAt: string;
  updatedAt?: string;
};
type AdminConversationRow = {
  id: string;
  type: string;
  title?: string | null;
  ownerId?: string | null;
  memberCount: number;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  members: Array<{
    userId: string;
    nickname: string;
    email?: string | null;
    phone?: string | null;
    disabledAt?: string | null;
    joinedAt: string;
    lastReadAt?: string | null;
  }>;
};

type AdminUserChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  type: string;
  body?: string | null;
  mediaUrl?: string | null;
  mediaThumbnailUrl?: string | null;
  sourceLanguage?: string | null;
  createdAt: string;
  sender?: {
    id: string;
    nickname: string;
    email?: string | null;
    phone?: string | null;
    disabledAt?: string | null;
  } | null;
  translations: Array<{ language: string; body: string; createdAt: string }>;
};

type AdminUserChatConversation = AdminConversationRow & {
  messages: AdminUserChatMessage[];
};

type AdminUserChats = {
  user: AdminUserRow;
  conversations: AdminUserChatConversation[];
};
type AdminFeedbackRow = {
  id: string;
  userId: string;
  category: string;
  message: string;
  attachmentUrl?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    email?: string | null;
    phone?: string | null;
    nickname: string;
    disabledAt?: string | null;
  };
};
const speechLanguageByTranslationLanguage: Record<TranslationLanguage, string> = {
  zh: "zh-CN",
  en: "en-US",
  hi: "hi-IN",
  ar: "ar-SA",
  bn: "bn-IN",
  de: "de-DE",
  es: "es-ES",
  fr: "fr-FR",
  id: "id-ID",
  it: "it-IT",
  ja: "ja-JP",
  ko: "ko-KR",
  ms: "ms-MY",
  nl: "nl-NL",
  pt: "pt-PT",
  ru: "ru-RU",
  ta: "ta-IN",
  te: "te-IN",
  th: "th-TH",
  tr: "tr-TR",
  ur: "ur-PK",
  vi: "vi-VN"
};

const targetLanguageScriptPatterns: Partial<Record<TranslationLanguage, RegExp>> = {
  zh: /[\u3400-\u9fff]/,
  hi: /[\u0900-\u097f]/,
  ar: /[\u0600-\u06ff]/,
  ur: /[\u0600-\u06ff]/,
  bn: /[\u0980-\u09ff]/,
  ja: /[\u3040-\u30ff]/,
  ko: /[\uac00-\ud7af]/,
  ru: /[\u0400-\u04ff]/,
  ta: /[\u0b80-\u0bff]/,
  te: /[\u0c00-\u0c7f]/,
  th: /[\u0e00-\u0e7f]/
};

function appearsToAlreadyBeTargetLanguage(text: string | undefined, targetLanguage: TranslationLanguage) {
  if (!text) return false;
  const pattern = targetLanguageScriptPatterns[targetLanguage];
  return pattern ? pattern.test(text) : false;
}

function inferSpeechLanguage(text: string | undefined, fallback: TranslationLanguage) {
  if (!text) return speechLanguageByTranslationLanguage[fallback];
  if (/[\u3400-\u9fff]/.test(text)) return speechLanguageByTranslationLanguage.zh;
  if (/[\u0900-\u097f]/.test(text)) return speechLanguageByTranslationLanguage.hi;
  if (/[\u0980-\u09ff]/.test(text)) return speechLanguageByTranslationLanguage.bn;
  if (/[\u0b80-\u0bff]/.test(text)) return speechLanguageByTranslationLanguage.ta;
  if (/[\u0c00-\u0c7f]/.test(text)) return speechLanguageByTranslationLanguage.te;
  if (/[\u0600-\u06ff]/.test(text)) return speechLanguageByTranslationLanguage.ur;
  if (/[\u3040-\u30ff]/.test(text)) return speechLanguageByTranslationLanguage.ja;
  if (/[\uac00-\ud7af]/.test(text)) return speechLanguageByTranslationLanguage.ko;
  if (/[\u0400-\u04ff]/.test(text)) return speechLanguageByTranslationLanguage.ru;
  if (/[\u0e00-\u0e7f]/.test(text)) return speechLanguageByTranslationLanguage.th;
  if (/[A-Za-z]/.test(text)) return speechLanguageByTranslationLanguage.en;
  return speechLanguageByTranslationLanguage[fallback];
}
function translationRequestKey(message: MessagePayload, targetLanguage: TranslationLanguage) {
  return `${message.id}:${targetLanguage}`;
}
function mergeMessageStatus(current: MessageSendStatus | undefined, next: MessageSendStatus) {
  if (!current || current === "failed") return next;
  const rank: Record<MessageSendStatus, number> = { sending: 0, sent: 1, delivered: 2, read: 3, failed: -1 };
  return rank[next] > rank[current] ? next : current;
}

function mergeMessages(current: MessagePayload[], incoming: MessagePayload[]) {
  const byId = new Map<string, MessagePayload>();
  const normalizeAttachmentType = (message: MessagePayload): MessagePayload =>
    message.mediaUrl && isCadDrawingFileName(message.body) && message.type !== "file"
      ? { ...message, type: "file", thumbnailUrl: undefined, albumId: undefined, albumIndex: undefined, albumSize: undefined }
      : message;
  for (const message of current) byId.set(message.id, normalizeAttachmentType(message));
  for (const message of incoming) byId.set(message.id, normalizeAttachmentType(message));
  return Array.from(byId.values()).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

function manualTranslationRevisions(manual: NonNullable<MessagePayload["manualTranslations"]>[TranslationLanguage]) {
  if (!manual) return [];
  return manual.revisions?.length ? manual.revisions : [manual];
}

function messageManualTranslationRevisions(message: MessagePayload) {
  return Object.values(message.manualTranslations ?? {}).flatMap((manual) => manualTranslationRevisions(manual));
}

function manualTranslationNeedsSync(message: MessagePayload, targetLanguage: TranslationLanguage) {
  const allRevisions = messageManualTranslationRevisions(message);
  if (!allRevisions.length) return false;
  const target = message.manualTranslations?.[targetLanguage];
  const targetRevisions = manualTranslationRevisions(target);
  if (!target || !targetRevisions.length) return true;
  const latestAll = allRevisions.reduce((latest, revision) => revision.editedAt > latest ? revision.editedAt : latest, "");
  const latestTarget = targetRevisions.reduce((latest, revision) => revision.editedAt > latest ? revision.editedAt : latest, "");
  const maxRevisionCount = Math.max(
    0,
    ...Object.values(message.manualTranslations ?? {}).map((manual) => manualTranslationRevisions(manual).length)
  );
  return latestTarget !== latestAll || targetRevisions.length < maxRevisionCount;
}

const translationEditorTones = [
  { text: "text-violet-700", highlight: "rounded bg-violet-100 text-violet-700", card: "border-violet-200 bg-violet-50/80" },
  { text: "text-sky-700", highlight: "rounded bg-sky-100 text-sky-700", card: "border-sky-200 bg-sky-50/80" },
  { text: "text-emerald-700", highlight: "rounded bg-emerald-100 text-emerald-700", card: "border-emerald-200 bg-emerald-50/80" },
  { text: "text-fuchsia-700", highlight: "rounded bg-fuchsia-100 text-fuchsia-700", card: "border-fuchsia-200 bg-fuchsia-50/80" },
  { text: "text-orange-700", highlight: "rounded bg-orange-100 text-orange-700", card: "border-orange-200 bg-orange-50/80" },
  { text: "text-cyan-700", highlight: "rounded bg-cyan-100 text-cyan-700", card: "border-cyan-200 bg-cyan-50/80" },
] as const;

const translationEditorTonesOnBrand = [
  { text: "text-yellow-200", highlight: "rounded bg-yellow-300/30 text-yellow-200", card: "border-yellow-200/50 bg-yellow-950/15" },
  { text: "text-sky-200", highlight: "rounded bg-sky-300/30 text-sky-200", card: "border-sky-200/50 bg-sky-950/15" },
  { text: "text-lime-200", highlight: "rounded bg-lime-300/30 text-lime-200", card: "border-lime-200/50 bg-lime-950/15" },
  { text: "text-fuchsia-200", highlight: "rounded bg-fuchsia-300/30 text-fuchsia-200", card: "border-fuchsia-200/50 bg-fuchsia-950/15" },
  { text: "text-orange-200", highlight: "rounded bg-orange-300/30 text-orange-200", card: "border-orange-200/50 bg-orange-950/15" },
  { text: "text-cyan-200", highlight: "rounded bg-cyan-300/30 text-cyan-200", card: "border-cyan-200/50 bg-cyan-950/15" },
] as const;

function translationEditorTone(editorId: string, onBrand = false) {
  let hash = 0;
  for (const character of editorId || "unknown-editor") hash = ((hash * 31) + character.charCodeAt(0)) >>> 0;
  const tones = onBrand ? translationEditorTonesOnBrand : translationEditorTones;
  return tones[hash % tones.length] ?? tones[0]!;
}

function normalizeScreenshotRect(start: ScreenshotPoint, end: ScreenshotPoint): ScreenshotSelection {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y)
  };
}

function rotateScreenshotPoint(point: ScreenshotPoint, sourceWidth: number, sourceHeight: number, clockwise: boolean): ScreenshotPoint {
  return clockwise
    ? { x: sourceHeight - point.y, y: point.x }
    : { x: point.y, y: sourceWidth - point.x };
}

function rotateScreenshotSelection(selection: ScreenshotSelection, sourceWidth: number, sourceHeight: number, clockwise: boolean): ScreenshotSelection {
  const corners = [
    { x: selection.x, y: selection.y },
    { x: selection.x + selection.width, y: selection.y },
    { x: selection.x, y: selection.y + selection.height },
    { x: selection.x + selection.width, y: selection.y + selection.height }
  ].map((point) => rotateScreenshotPoint(point, sourceWidth, sourceHeight, clockwise));
  const left = Math.min(...corners.map((point) => point.x));
  const top = Math.min(...corners.map((point) => point.y));
  const right = Math.max(...corners.map((point) => point.x));
  const bottom = Math.max(...corners.map((point) => point.y));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function rotateScreenshotAnnotation(annotation: ScreenshotAnnotation, sourceWidth: number, sourceHeight: number, clockwise: boolean): ScreenshotAnnotation {
  const rotate = (point: ScreenshotPoint) => rotateScreenshotPoint(point, sourceWidth, sourceHeight, clockwise);
  if (annotation.kind === 'pen' || annotation.kind === 'highlight' || annotation.kind === 'mosaic') {
    return { ...annotation, points: annotation.points.map(rotate) };
  }
  if (annotation.kind === 'text') {
    return { ...annotation, point: rotate(annotation.point) };
  }
  return { ...annotation, start: rotate(annotation.start), end: rotate(annotation.end) };
}

function rotateScreenshotOcrBlock(block: ScreenshotOcrBlock, sourceWidth: number, sourceHeight: number, clockwise: boolean): ScreenshotOcrBlock {
  const rotated = rotateScreenshotSelection(block, sourceWidth, sourceHeight, clockwise);
  return { ...block, ...rotated };
}

function drawScreenshotOcrTranslations(ctx: CanvasRenderingContext2D, blocks: ScreenshotOcrBlock[]) {
  const validColor = (value: string | undefined) => Boolean(value && /^#[0-9a-f]{6}$/i.test(value));
  const wrap = (text: string, maxWidth: number) => {
    const lines: string[] = [];
    for (const paragraph of text.split(/\r?\n/)) {
      const tokens = /\s/.test(paragraph) ? paragraph.split(/(\s+)/).filter(Boolean) : Array.from(paragraph);
      let line = '';
      for (const token of tokens) {
        const candidate = line + token;
        if (line && ctx.measureText(candidate).width > maxWidth) {
          lines.push(line.trimEnd());
          line = token.trimStart();
        } else line = candidate;
      }
      if (line || !paragraph) lines.push(line);
    }
    return lines;
  };
  for (const block of blocks) {
    const text = block.translatedText?.trim();
    if (!text) continue;
    const x = clampNumber(block.x, 0, ctx.canvas.width - 1);
    const y = clampNumber(block.y, 0, ctx.canvas.height - 1);
    const width = clampNumber(block.width, 4, ctx.canvas.width - x);
    const height = clampNumber(block.height, 4, ctx.canvas.height - y);
    const padding = Math.max(1, Math.min(width, height) * 0.04);
    let backgroundColor = validColor(block.backgroundColor) ? block.backgroundColor! : '#ffffff';
    if (!validColor(block.backgroundColor)) {
      const samplePoints: Array<[number, number]> = [
        [x + 1, y + 1], [x + width - 2, y + 1], [x + 1, y + height - 2], [x + width - 2, y + height - 2]
      ];
      const colors = samplePoints.map(([sampleX, sampleY]) => ctx.getImageData(Math.round(sampleX), Math.round(sampleY), 1, 1).data);
      const red = Math.round(colors.reduce((sum, color) => sum + (color[0] ?? 255), 0) / colors.length);
      const green = Math.round(colors.reduce((sum, color) => sum + (color[1] ?? 255), 0) / colors.length);
      const blue = Math.round(colors.reduce((sum, color) => sum + (color[2] ?? 255), 0) / colors.length);
      backgroundColor = `rgb(${red}, ${green}, ${blue})`;
    }
    const backgroundMatch = backgroundColor.match(/\d+/g)?.map(Number) ?? [];
    const luminance = backgroundMatch.length >= 3 ? (backgroundMatch[0]! * 0.299 + backgroundMatch[1]! * 0.587 + backgroundMatch[2]! * 0.114) : 255;
    const textColor = validColor(block.fontColor) ? block.fontColor! : luminance > 145 ? '#111111' : '#ffffff';
    ctx.save();
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(x, y, width, height);
    const fontWeight = block.fontWeight === 'bold' ? '700' : '400';
    let fontSize = Math.max(8, Math.min(height * 0.76, 64));
    let lines: string[] = [];
    let lineHeight = fontSize * 1.12;
    while (fontSize >= 8) {
      ctx.font = `${fontWeight} ${fontSize}px Arial, "Noto Sans", sans-serif`;
      lines = wrap(text, Math.max(2, width - padding * 2));
      lineHeight = fontSize * 1.12;
      if (lines.length * lineHeight <= height - padding * 2) break;
      fontSize -= 1;
    }
    const maxLines = Math.max(1, Math.floor((height - padding * 2) / lineHeight));
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      let last = lines[maxLines - 1] ?? '';
      while (last && ctx.measureText(`${last}…`).width > width - padding * 2) last = last.slice(0, -1);
      lines[maxLines - 1] = `${last}…`;
    }
    ctx.fillStyle = textColor;
    ctx.textBaseline = 'top';
    ctx.textAlign = block.textAlign ?? 'left';
    const textX = block.textAlign === 'center' ? x + width / 2 : block.textAlign === 'right' ? x + width - padding : x + padding;
    const textHeight = lines.length * lineHeight;
    const firstY = y + Math.max(padding, (height - textHeight) / 2);
    lines.forEach((line, index) => ctx.fillText(line, textX, firstY + index * lineHeight, width - padding * 2));
    ctx.restore();
  }
}

function screenshotTextBounds(annotation: ScreenshotTextAnnotation) {
  const fontSize = Math.max(22, annotation.width * 8);
  const lines = annotation.text.split(/\r?\n/);
  const longestLine = lines.reduce((longest, line) => Math.max(longest, line.length), 0);
  return {
    x: annotation.point.x,
    y: annotation.point.y,
    width: Math.max(36, longestLine * fontSize * 0.62 + 10),
    height: Math.max(fontSize + 8, lines.length * (fontSize + 4))
  };
}

function drawScreenshotAnnotations(ctx: CanvasRenderingContext2D, annotations: ScreenshotAnnotation[]) {
  for (const annotation of annotations) {
    ctx.save();
    ctx.strokeStyle = annotation.color;
    ctx.fillStyle = annotation.color;
    ctx.lineWidth = annotation.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([]);
    if (annotation.kind === 'pen' || annotation.kind === 'highlight' || annotation.kind === 'mosaic') {
      if (annotation.points.length < (annotation.kind === 'mosaic' ? 1 : 2)) {
        ctx.restore();
        continue;
      }
      const firstPoint = annotation.points[0];
      if (!firstPoint) {
        ctx.restore();
        continue;
      }
      if (annotation.kind === 'mosaic') {
        const blockSize = Math.max(10, annotation.width * 6);
        for (const point of annotation.points) {
          const startX = Math.max(0, Math.min(ctx.canvas.width - 1, Math.round(point.x - blockSize / 2)));
          const startY = Math.max(0, Math.min(ctx.canvas.height - 1, Math.round(point.y - blockSize / 2)));
          const sampleWidth = Math.max(1, Math.min(blockSize, ctx.canvas.width - startX));
          const sampleHeight = Math.max(1, Math.min(blockSize, ctx.canvas.height - startY));
          const pixels = ctx.getImageData(startX, startY, sampleWidth, sampleHeight).data;
          let red = 0;
          let green = 0;
          let blue = 0;
          let count = 0;
          for (let index = 0; index < pixels.length; index += 4) {
            red += pixels[index] ?? 0;
            green += pixels[index + 1] ?? 0;
            blue += pixels[index + 2] ?? 0;
            count += 1;
          }
          ctx.fillStyle = 'rgb(' + Math.round(red / Math.max(1, count)) + ', ' + Math.round(green / Math.max(1, count)) + ', ' + Math.round(blue / Math.max(1, count)) + ')';
          ctx.fillRect(startX, startY, sampleWidth, sampleHeight);
        }
        ctx.restore();
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(firstPoint.x, firstPoint.y);
      for (const point of annotation.points.slice(1)) ctx.lineTo(point.x, point.y);
      if (annotation.kind === 'pen') {
        const penType = annotation.penType ?? 'round';
        ctx.lineCap = penType === 'square' ? 'square' : 'round';
        ctx.lineJoin = penType === 'square' ? 'bevel' : 'round';
        ctx.setLineDash(penType === 'dashed' ? [annotation.width * 3, annotation.width * 2] : []);
      }
      if (annotation.kind === 'highlight') {
        ctx.globalAlpha = 0.28;
        ctx.lineCap = 'square';
        ctx.lineWidth = Math.max(12, annotation.width * 4);
      }
      ctx.stroke();
    } else if (annotation.kind === 'rectangle') {
      const rect = normalizeScreenshotRect(annotation.start, annotation.end);
      ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    } else if (annotation.kind === 'ellipse') {
      const rect = normalizeScreenshotRect(annotation.start, annotation.end);
      ctx.beginPath();
      ctx.ellipse(rect.x + rect.width / 2, rect.y + rect.height / 2, Math.max(0.5, rect.width / 2), Math.max(0.5, rect.height / 2), 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (annotation.kind === 'arrow') {
      const angle = Math.atan2(annotation.end.y - annotation.start.y, annotation.end.x - annotation.start.x);
      const headLength = Math.max(14, annotation.width * 4);
      ctx.beginPath();
      ctx.moveTo(annotation.start.x, annotation.start.y);
      ctx.lineTo(annotation.end.x, annotation.end.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(annotation.end.x, annotation.end.y);
      ctx.lineTo(annotation.end.x - headLength * Math.cos(angle - Math.PI / 6), annotation.end.y - headLength * Math.sin(angle - Math.PI / 6));
      ctx.moveTo(annotation.end.x, annotation.end.y);
      ctx.lineTo(annotation.end.x - headLength * Math.cos(angle + Math.PI / 6), annotation.end.y - headLength * Math.sin(angle + Math.PI / 6));
      ctx.stroke();
    } else if (annotation.kind === 'text') {
      const fontSize = Math.max(22, annotation.width * 8);
      ctx.font = `700 ${fontSize}px sans-serif`;
      ctx.textBaseline = 'top';
      const lines = annotation.text.split(/\r?\n/);
      lines.forEach((line, index) => {
        const y = annotation.point.y + index * (fontSize + 4);
        ctx.lineWidth = Math.max(3, annotation.width + 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.strokeText(line, annotation.point.x, y);
        ctx.fillStyle = annotation.color;
        ctx.fillText(line, annotation.point.x, y);
      });
    }
    ctx.restore();
  }
}

function matchesConfiguredShortcut(event: { key: string; altKey: boolean; ctrlKey: boolean; shiftKey: boolean; metaKey: boolean }, configured: string) {
  const parts = configured.toUpperCase().replace(/\s+/g, '').split('+').filter(Boolean);
  if (parts.length === 0) return false;
  const keyToken = parts[parts.length - 1];
  const modifiers = new Set(parts.slice(0, -1));
  if (modifiers.has('ALT') !== event.altKey) return false;
  if (modifiers.has('CTRL') !== event.ctrlKey) return false;
  if (modifiers.has('SHIFT') !== event.shiftKey) return false;
  if (modifiers.has('META') !== event.metaKey && modifiers.has('CMD') !== event.metaKey) return false;
  const normalizedKey = event.key.toUpperCase();
  if (keyToken === 'SPACE') return event.key === ' ';
  if (keyToken === 'ESC' || keyToken === 'ESCAPE') return normalizedKey === 'ESCAPE';
  return normalizedKey === keyToken;
}

function isMobileComposerViewport() {
  if (typeof window === "undefined") return false;
  const narrowViewport = typeof window.matchMedia === "function"
    ? window.matchMedia("(max-width: 767px)").matches
    : window.innerWidth < 768;
  const coarsePointer = typeof window.matchMedia === "function"
    ? window.matchMedia("(pointer: coarse)").matches
    : (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0);
  return narrowViewport || (coarsePointer && window.innerWidth < 1024);
}

function isValidEmailAddress(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function OverflowMarqueeText({ text, className = "" }: { text: string; className?: string }) {
  const viewportRef = useRef<HTMLSpanElement | null>(null);
  const contentRef = useRef<HTMLSpanElement | null>(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const measure = () => {
      const viewport = viewportRef.current;
      const content = contentRef.current;
      if (!viewport || !content) return;
      setOverflowing(content.scrollWidth > viewport.clientWidth + 1);
    };
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (viewportRef.current) observer?.observe(viewportRef.current);
    if (contentRef.current) observer?.observe(contentRef.current);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [text]);

  const durationSeconds = Math.max(10, Math.min(24, text.length * 0.28));
  return (
    <span ref={viewportRef} className={`block min-w-0 overflow-hidden ${className}`} data-overflow-marquee={overflowing ? "active" : "inactive"} title={text}>
      {overflowing ? (
        <span className="glimpse-continuous-marquee inline-flex w-max whitespace-nowrap" style={{ animationDuration: `${durationSeconds}s` }}>
          <span ref={contentRef} className="shrink-0 pr-8">{text}</span>
          <span aria-hidden="true" className="shrink-0 pr-8">{text}</span>
        </span>
      ) : <span ref={contentRef} className="block whitespace-nowrap">{text}</span>}
    </span>
  );
}

const detailModalCardClass = "mx-auto mt-4 flex h-[min(92vh,800px)] max-h-[92vh] w-full flex-col overflow-hidden rounded-[28px] border border-white/80 bg-white/95 p-4 shadow-2xl backdrop-blur-xl";
const detailHeaderClass = "flex shrink-0 items-center justify-between gap-3 border-b border-line pb-3";
const detailHeroClass = "mt-4 flex items-center gap-3 rounded-3xl border border-line bg-white/80 p-3 shadow-sm";
const detailSectionClass = "rounded-2xl border border-line bg-white/80 p-3 shadow-sm";
const detailActionClass = "flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-line bg-white px-3 py-2 text-sm font-medium text-ink shadow-sm hover:border-brand disabled:opacity-50";
const detailSecondaryButtonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-line bg-white px-3 py-2 text-sm font-medium text-ink shadow-sm hover:border-brand disabled:opacity-60";
const messageActionIconMenuButtonClass = "grid h-11 w-11 place-items-center rounded-2xl border border-line bg-white text-ink shadow-sm transition hover:border-brand hover:bg-paper disabled:opacity-40";
const detailQuickActionClass = "flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border px-2 py-3 text-center text-xs font-semibold shadow-sm transition hover:shadow-md disabled:opacity-50";
const profilePageCardClass = "rounded-3xl border border-white/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl";
const profilePageSectionClass = "rounded-2xl border border-line bg-white/80 p-3 shadow-sm";

export function ChatPrototype() {
  const [tab, setTab] = useState<Tab>("chats");
  const [mobilePane, setMobilePane] = useState<MobilePane>("list");
  const [uiLanguage, setUiLanguage] = useState<UiLanguage>(() => getStoredUiLanguage());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [appSlogans, setAppSlogans] = useState<AppSlogan[]>(DEFAULT_APP_SLOGANS);
  const [activeSlogan, setActiveSlogan] = useState<AppSlogan>(() => pickRandomSlogan(DEFAULT_APP_SLOGANS));
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);
  const [ttsConfig, setTtsConfig] = useState<TtsRuntimeConfig>({ provider: "loading", doubao: { voiceType: "", voices: [] }, aliyun: { voiceType: "", model: "", voices: [] } });
  const [ttsConfigLoading, setTtsConfigLoading] = useState(false);
  const [ttsConfigNotice, setTtsConfigNotice] = useState("");
  const [selectedTtsVoiceType, setSelectedTtsVoiceType] = useState("");
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const ttsPlaybackRunRef = useRef(0);
  const [translationTargetLanguage, setTranslationTargetLanguage] = useState<TranslationLanguage>(() => {
    if (typeof window === "undefined") return uiLanguage;
    const stored = window.localStorage.getItem("glimpse.translationTargetLanguage");
    return TRANSLATION_LANGUAGE_OPTIONS.some((item) => item.code === stored) ? (stored as TranslationLanguage) : uiLanguage;
  });
  const translationTargetLanguagePreferenceRef = useRef(typeof window !== "undefined" && TRANSLATION_LANGUAGE_OPTIONS.some((item) => item.code === window.localStorage.getItem("glimpse.translationTargetLanguage")));
  const [messageDisplayMode, setMessageDisplayMode] = useState<MessageDisplayMode>(() => {
    if (typeof window === "undefined") return "bilingual";
    const stored = window.localStorage.getItem("glimpse.messageDisplayMode");
    return stored === "original" || stored === "translated" || stored === "bilingual" ? stored : "bilingual";
  });
  const [messageActionDisplayMode, setMessageActionDisplayMode] = useState<MessageActionDisplayMode>(() => {
    if (typeof window === "undefined") return "compact";
    const stored = window.localStorage.getItem("glimpse.messageActionDisplayMode");
    return stored === "inline" || stored === "compact" || stored === "long-press" ? stored : "compact";
  });
  const [messageTimeDisplayMode, setMessageTimeDisplayMode] = useState<MessageTimeDisplayMode>(() => {
    if (typeof window === "undefined") return "tail";
    const stored = window.localStorage.getItem("glimpse.messageTimeDisplayMode");
    return stored === "bottom" || stored === "hidden" ? stored : "tail";
  });
  const [showMessageReadStatus, setShowMessageReadStatus] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("glimpse.showMessageReadStatus") !== "false";
  });
  const [showSenderNames, setShowSenderNames] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("glimpse.showSenderNames") === "true";
  });
  const [speechAccent, setSpeechAccent] = useState<SpeechAccent>(() => {
    if (typeof window === "undefined") return "auto";
    const stored = window.localStorage.getItem("glimpse.speechAccent");
    return speechAccentOptions.some((item) => item.code === stored) ? (stored as SpeechAccent) : "auto";
  });
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("glimpse.notificationsEnabled") !== "false";
  });
  const [notificationSoundEnabled, setNotificationSoundEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("glimpse.notificationSoundEnabled") === "true";
  });
  const [notificationVibrationEnabled, setNotificationVibrationEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("glimpse.notificationVibrationEnabled") !== "false";
  });
  const [globalQuery, setGlobalQuery] = useState("");
  const [contactQuery, setContactQuery] = useState("");
  const [serverGlobalSearchResults, setServerGlobalSearchResults] = useState<GlobalSearchResult[]>([]);
  const [selectedId, setSelectedId] = useState(defaultConversation.id);
  const [pendingShortcutConversationId, setPendingShortcutConversationId] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("conversation") ?? "";
  });
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messagesByConversation, setMessagesByConversation] = useState<Record<string, MessagePayload[]>>({});
  const [messageStatuses, setMessageStatuses] = useState<Record<string, MessageSendStatus>>({});
  const [highlightedMessageIds, setHighlightedMessageIds] = useState<Record<string, boolean>>({});
  const [speakingMessageKey, setSpeakingMessageKey] = useState<string>("");
  const [translationLoading, setTranslationLoading] = useState<Record<string, boolean>>({});
  const [translationErrors, setTranslationErrors] = useState<Record<string, string>>({});
  const [translationEditDraft, setTranslationEditDraft] = useState<{ messageId: string; targetLanguage: TranslationLanguage; body: string } | null>(null);
  const translationEditBodyRef = useRef("");
  const translationEditBodyKeyRef = useRef("");
  const translationEditTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [translationEditSaving, setTranslationEditSaving] = useState(false);
  const [draft, setDraft] = useState("");
  const [mediaUploading, setMediaUploading] = useState(false);
  const [mediaUploadProgress, setMediaUploadProgress] = useState(0);
  const [pendingComposerFiles, setPendingComposerFiles] = useState<File[]>([]);
  const [mediaSendVariant, setMediaSendVariant] = useState<MediaSendVariant>("preview");
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [locationName, setLocationName] = useState("");
  const [locationLatitude, setLocationLatitude] = useState("");
  const [locationLongitude, setLocationLongitude] = useState("");
  const [locationLoading, setLocationLoading] = useState(false);
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [composerInputMode, setComposerInputMode] = useState<"keyboard" | "voice">("keyboard");
  const [speechToTextListening, setSpeechToTextListening] = useState(false);
  const [speechToTextLoading, setSpeechToTextLoading] = useState(false);
  const [visibleTranscriptIds, setVisibleTranscriptIds] = useState<Set<string>>(() => new Set());
  const [voiceTranscriptionLoading, setVoiceTranscriptionLoading] = useState<Record<string, boolean>>({});
  const [pendingVoicePreview, setPendingVoicePreview] = useState<PendingVoicePreview | null>(null);
  const [failedMediaFile, setFailedMediaFile] = useState<File | null>(null);
  const [previewMedia, setPreviewMedia] = useState<GalleryMediaPreview | null>(null);
  const [galleryActionItem, setGalleryActionItem] = useState<MessagePayload | null>(null);
  const [previewRotation, setPreviewRotation] = useState(0);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [previewTransformOrigin, setPreviewTransformOrigin] = useState("center center");
  const [previewVideoFit, setPreviewVideoFit] = useState<VideoFitMode>("auto");
  const [previewVideoSize, setPreviewVideoSize] = useState<{ width: number; height: number } | null>(null);
  const [screenshotEditorOpen, setScreenshotEditorOpen] = useState(false);
  const [screenshotSource, setScreenshotSource] = useState('');
  const [screenshotSourceSize, setScreenshotSourceSize] = useState({ width: 0, height: 0 });
  const [screenshotTool, setScreenshotTool] = useState<ScreenshotTool>('select');
  const [screenshotColor, setScreenshotColor] = useState('#ef4444');
  const [screenshotStrokeWidth, setScreenshotStrokeWidth] = useState(4);
  const [screenshotPenType, setScreenshotPenType] = useState<ScreenshotPenType>('round');
  const [screenshotSelection, setScreenshotSelection] = useState<ScreenshotSelection | null>(null);
  const [screenshotAnnotations, setScreenshotAnnotations] = useState<ScreenshotAnnotation[]>([]);
  const [screenshotTextPoint, setScreenshotTextPoint] = useState<ScreenshotPoint | null>(null);
  const [screenshotTextDraft, setScreenshotTextDraft] = useState('');
  const [screenshotTextEditingId, setScreenshotTextEditingId] = useState<string | null>(null);
  const [screenshotSelectedAnnotationId, setScreenshotSelectedAnnotationId] = useState<string | null>(null);
  const [screenshotRotation, setScreenshotRotation] = useState(0);
  const [screenshotRotationBusy, setScreenshotRotationBusy] = useState(false);
  const [screenshotUndoStack, setScreenshotUndoStack] = useState<ScreenshotHistoryState[]>([]);
  const [screenshotRedoStack, setScreenshotRedoStack] = useState<ScreenshotHistoryState[]>([]);
  const [screenshotOcrText, setScreenshotOcrText] = useState("");
  const [screenshotOcrBlocks, setScreenshotOcrBlocks] = useState<ScreenshotOcrBlock[]>([]);
  const [screenshotOcrTranslationText, setScreenshotOcrTranslationText] = useState("");
  const [screenshotOcrTargetLanguage, setScreenshotOcrTargetLanguage] = useState<TranslationLanguage>(translationTargetLanguage);
  const [screenshotOcrLoading, setScreenshotOcrLoading] = useState(false);
  const [screenshotOcrTranslateLoading, setScreenshotOcrTranslateLoading] = useState(false);
  const [screenshotOcrStatus, setScreenshotOcrStatus] = useState<{ kind: "loading" | "success" | "error"; message: string } | null>(null);
  const [mediaLibraryOpen, setMediaLibraryOpen] = useState(false);
  const [composerMenuOpen, setComposerMenuOpen] = useState(false);
  const [stickerPanelOpen, setStickerPanelOpen] = useState(false);
  const [selectedStickerCategory, setSelectedStickerCategory] = useState("frequent");
  const [stickerSearchOpen, setStickerSearchOpen] = useState(false);
  const [stickerSearchQuery, setStickerSearchQuery] = useState("");
  const [favoriteStickerIds, setFavoriteStickerIds] = useState<Set<string>>(() => new Set());
  const [stickerActionMenu, setStickerActionMenu] = useState<{ sticker: StickerDefinition; x: number; y: number; openedAt: number } | null>(null);
  const stickerLongPressTimerRef = useRef<number | null>(null);
  const stickerLongPressTriggeredRef = useRef(false);
  const skipNextStickerFavoriteSaveRef = useRef(false);
  const stickerFavoriteMutationVersionRef = useRef(0);
  const [mediaLibraryView, setMediaLibraryView] = useState<"history" | "files">("history");
  const [mediaLibraryScope, setMediaLibraryScope] = useState<"current" | "all">("current");
  const [mediaLibraryFilter, setMediaLibraryFilter] = useState<MediaLibraryFilter>("all");
  const [mediaLibrarySort, setMediaLibrarySort] = useState<"name-asc" | "name-desc" | "size-asc" | "size-desc">("name-asc");
  const [selectedManagedFileIds, setSelectedManagedFileIds] = useState<Set<string>>(() => new Set());
  const [managedFileDeleting, setManagedFileDeleting] = useState(false);
  const [mediaLibraryReturnDetails, setMediaLibraryReturnDetails] = useState<{ kind: "contact"; user: SearchUser } | { kind: "group"; conversation: Conversation } | null>(null);
  const [archivePreview, setArchivePreview] = useState<ArchivePreviewState | null>(null);
  const [documentPreview, setDocumentPreview] = useState<DocumentPreviewState | null>(null);
  const [documentPreviewMinimized, setDocumentPreviewMinimized] = useState(false);
  const [documentPreviewFloatingPosition, setDocumentPreviewFloatingPosition] = useState<{ x: number; y: number } | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = JSON.parse(window.localStorage.getItem("glimpse.documentPreviewFloatingPosition") ?? "null") as { x?: unknown; y?: unknown } | null;
      return stored && typeof stored.x === "number" && typeof stored.y === "number" ? { x: stored.x, y: stored.y } : null;
    } catch {
      return null;
    }
  });
  const [documentPreviewZoom, setDocumentPreviewZoom] = useState(1);
  const [documentPreviewRotation, setDocumentPreviewRotation] = useState(0);
  const [documentPreviewScrollProgress, setDocumentPreviewScrollProgress] = useState(0);
  const [documentSaveFormat, setDocumentSaveFormat] = useState<OfficeConversionFormat>("pdf");
  const [documentConverting, setDocumentConverting] = useState(false);
  const [documentTranslationTarget, setDocumentTranslationTarget] = useState<TranslationLanguage>(translationTargetLanguage);
  const [documentTranslating, setDocumentTranslating] = useState(false);
  const [documentTranslationStatus, setDocumentTranslationStatus] = useState("");
  const [documentTranslatedFile, setDocumentTranslatedFile] = useState<UploadedMediaResponse | null>(null);
  const [documentTranslationViewMode, setDocumentTranslationViewMode] = useState<DocumentTranslationViewMode>("original");
  const [messageSearchQuery, setMessageSearchQuery] = useState("");
  const [messageReminders, setMessageReminders] = useState<MessageReminder[]>([]);
  const [favoriteMessages, setFavoriteMessages] = useState<FavoriteMessageView[]>([]);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [favoritesSendMode, setFavoritesSendMode] = useState(false);
  const [favoritePreviewItem, setFavoritePreviewItem] = useState<FavoriteMessageView | null>(null);
  const [favoriteActionItem, setFavoriteActionItem] = useState<FavoriteMessageView | null>(null);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [favoriteSearchQuery, setFavoriteSearchQuery] = useState("");
  const [messageSelectMode, setMessageSelectMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(() => new Set());
  const [messageActionMenuId, setMessageActionMenuId] = useState<string | null>(null);
  const [messageSwipeVisual, setMessageSwipeVisual] = useState<{ messageId: string; offset: number; active: boolean } | null>(null);
  const [favoriteMessageIds, setFavoriteMessageIds] = useState<Set<string>>(() => new Set());
  const [forwardMessages, setForwardMessages] = useState<MessagePayload[]>([]);
  const [forwardMode, setForwardMode] = useState<'normal' | 'merged'>('normal');
  const [forwardQuery, setForwardQuery] = useState("");
  const [messageSearchType, setMessageSearchType] = useState<MessageSearchType>("all");
  const [messageSearchDate, setMessageSearchDate] = useState("");
  const [conversationMenu, setConversationMenu] = useState<{ conversationId: string; x: number; y: number } | null>(null);
  const [pinnedConversationIds, setPinnedConversationIds] = useState<Set<string>>(() => new Set());
  const [hiddenConversationIds, setHiddenConversationIds] = useState<Set<string>>(() => new Set());
  const [hiddenContactUserIds, setHiddenContactUserIds] = useState<Set<string>>(() => new Set());
  const [hiddenMessageIds, setHiddenMessageIds] = useState<Set<string>>(() => new Set());
  const [notice, setNotice] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>("reconnecting");
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(() => new Set());
  const [accessToken, setAccessToken] = useState("");
  const [currentUser, setCurrentUser] = useState<PublicUser | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authNickname, setAuthNickname] = useState("");
  const [authVerificationCode, setAuthVerificationCode] = useState("");
  const [authCodeSending, setAuthCodeSending] = useState(false);
  const [authCodeNotice, setAuthCodeNotice] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [passwordResetToken, setPasswordResetToken] = useState("");
  const [passwordResetNew, setPasswordResetNew] = useState("");
  const [passwordResetConfirm, setPasswordResetConfirm] = useState("");
  const [passwordResetSaving, setPasswordResetSaving] = useState(false);
  const [changePasswordCurrent, setChangePasswordCurrent] = useState("");
  const [changePasswordNew, setChangePasswordNew] = useState("");
  const [changePasswordConfirm, setChangePasswordConfirm] = useState("");
  const [changePasswordSaving, setChangePasswordSaving] = useState(false);
  const [profilePublicId, setProfilePublicId] = useState("");
  const [profileIsPublic, setProfileIsPublic] = useState(true);
  const [profileEmailPublic, setProfileEmailPublic] = useState(false);
  const [profilePhonePublic, setProfilePhonePublic] = useState(false);
  const [profileNicknameValue, setProfileNicknameValue] = useState("");
  const [profilePhoneValue, setProfilePhoneValue] = useState("");
  const [profileAvatarUrl, setProfileAvatarUrl] = useState("");
  const [profileAvatarPreviewUrl, setProfileAvatarPreviewUrl] = useState("");
  const [profileCompany, setProfileCompany] = useState("");
  const [profileTitle, setProfileTitle] = useState("");
  const [profileLocation, setProfileLocation] = useState("");
  const [profileBio, setProfileBio] = useState("");
  const [profileSignature, setProfileSignature] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileNotice, setProfileNotice] = useState("");
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileSignatureEditing, setProfileSignatureEditing] = useState(false);
  const [profileSignatureSaving, setProfileSignatureSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarUploadProgress, setAvatarUploadProgress] = useState(0);
  const [avatarCropSource, setAvatarCropSource] = useState("");
  const [avatarCropTarget, setAvatarCropTarget] = useState<"profile" | "group">("profile");
  const [avatarCropScale, setAvatarCropScale] = useState(1);
  const [avatarCropOffset, setAvatarCropOffset] = useState<AvatarCropOffset>({ x: 0, y: 0 });
  const [avatarCropImageSize, setAvatarCropImageSize] = useState<AvatarCropImageSize>({ width: 0, height: 0 });
  const [avatarCropFrameSize, setAvatarCropFrameSize] = useState(320);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackAttachment, setFeedbackAttachment] = useState<UploadedMediaResponse | null>(null);
  const [feedbackAttachmentUploading, setFeedbackAttachmentUploading] = useState(false);
  const [feedbackAttachmentProgress, setFeedbackAttachmentProgress] = useState(0);
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [replyingToMessage, setReplyingToMessage] = useState<ReplyDraft | null>(null);
  const [sendWithEnter, setSendWithEnter] = useState(true);
  const [isMobileComposerDevice, setIsMobileComposerDevice] = useState(false);
  const [sendShortcutLoadedKey, setSendShortcutLoadedKey] = useState("");
  const [screenshotShortcut, setScreenshotShortcut] = useState("ALT+Q");
  const [voiceLevels, setVoiceLevels] = useState<number[]>(Array(28).fill(0));
  const [typingUserNames, setTypingUserNames] = useState<string[]>([]);
  const [mentionPickerOpen, setMentionPickerOpen] = useState(false);
  const [pendingContactCall, setPendingContactCall] = useState<{ conversationId: string; media: CallMediaKind; participantUserIds?: string[] } | null>(null);
  const [contactRemarks, setContactRemarks] = useState<Record<string, string>>({});
  const [contactMemos, setContactMemos] = useState<Record<string, string>>({});
  const [contactMemoImages, setContactMemoImages] = useState<Record<string, string[]>>({});
  const [contactMemoDraft, setContactMemoDraft] = useState("");
  const [contactMemoImagesDraft, setContactMemoImagesDraft] = useState<string[]>([]);
  const [contactMemoImageLoading, setContactMemoImageLoading] = useState(false);
  const [contactMemoSavingId, setContactMemoSavingId] = useState("");
  const [contactTags, setContactTags] = useState<Record<string, string[]>>({});
  const [contactTagPanelOpen, setContactTagPanelOpen] = useState(false);
  const [contactTagFilters, setContactTagFilters] = useState<string[]>([]);
  const [contactTagDraft, setContactTagDraft] = useState("");
  const [contactTagsSavingId, setContactTagsSavingId] = useState("");
  const [contactActionMenu, setContactActionMenu] = useState<{ userId: string; x: number; y: number } | null>(null);
  const [editingContactRemarkId, setEditingContactRemarkId] = useState("");
  const [adminOverview, setAdminOverview] = useState<AdminOverview | null>(null);
  const [adminUsers, setAdminUsers] = useState<AdminUserRow[]>([]);
  const [adminConversations, setAdminConversations] = useState<AdminConversationRow[]>([]);
  const [adminFeedback, setAdminFeedback] = useState<AdminFeedbackRow[]>([]);
  const [adminSettings, setAdminSettings] = useState<AdminSettingRow[]>([]);
  const [adminSettingDrafts, setAdminSettingDrafts] = useState<Record<string, string>>({});
  const [adminSettingGroupFilter, setAdminSettingGroupFilter] = useState("all");
  const [adminSettingSearch, setAdminSettingSearch] = useState("");
  const [adminSloganDrafts, setAdminSloganDrafts] = useState<AdminSlogan[]>(defaultAdminSlogans);
  const [adminSloganPrompt, setAdminSloganPrompt] = useState("");
  const [adminSloganGenerating, setAdminSloganGenerating] = useState(false);
  const [adminSloganPublishing, setAdminSloganPublishing] = useState(false);
  const [adminSettingsSaving, setAdminSettingsSaving] = useState(false);
  const [adminSmtpTestSaving, setAdminSmtpTestSaving] = useState(false);
  const [adminSettingsNotice, setAdminSettingsNotice] = useState("");
  const [adminToolHealth, setAdminToolHealth] = useState<AdminToolHealth | null>(null);
  const [adminToolHealthLoading, setAdminToolHealthLoading] = useState(false);
  const [adminToolHealthError, setAdminToolHealthError] = useState("");
  const [adminToolRetestingIds, setAdminToolRetestingIds] = useState<Set<string>>(() => new Set());
  const [adminAccounts, setAdminAccounts] = useState<AdminUserRow[]>([]);
  const [adminAccountForm, setAdminAccountForm] = useState({ email: "", phone: "", nickname: "", password: "", adminPermissions: ADMIN_PERMISSION_OPTIONS.map((item) => item.code) });
  const [adminAccountSaving, setAdminAccountSaving] = useState(false);
  const [adminAccountNotice, setAdminAccountNotice] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [adminDashboardTab, setAdminDashboardTab] = useState<AdminDashboardTab>("overview");
  const [adminActionUserId, setAdminActionUserId] = useState("");
  const [adminPasswordReset, setAdminPasswordReset] = useState<{ user: AdminUserRow; temporaryPassword: string } | null>(null);
  const [adminFeedbackActionId, setAdminFeedbackActionId] = useState("");
  const [adminUserChatsLoadingId, setAdminUserChatsLoadingId] = useState("");
  const [adminSelectedUserChats, setAdminSelectedUserChats] = useState<AdminUserChats | null>(null);
  const [adminUserQuery, setAdminUserQuery] = useState("");
  const [adminUserChatQuery, setAdminUserChatQuery] = useState("");
  const [adminFeedbackQuery, setAdminFeedbackQuery] = useState("");
  const [adminConversationQuery, setAdminConversationQuery] = useState("");
  const filteredAdminUsers = useMemo(() => {
    const keyword = adminUserQuery.trim().toLowerCase();
    if (!keyword) return adminUsers;
    return adminUsers.filter((user) => [user.nickname, user.email, user.phone, user.id, user.role, user.language, user.disabledAt ? "disabled" : "active"].some((value) => String(value ?? "").toLowerCase().includes(keyword)));
  }, [adminUserQuery, adminUsers]);

  const filteredAdminFeedback = useMemo(() => {
    const keyword = adminFeedbackQuery.trim().toLowerCase();
    if (!keyword) return adminFeedback;
    return adminFeedback.filter((feedback) => [feedback.id, feedback.category, feedback.status, feedback.message, feedback.attachmentUrl, feedback.user.nickname, feedback.user.email, feedback.user.phone, feedback.userId].some((value) => String(value ?? "").toLowerCase().includes(keyword)));
  }, [adminFeedbackQuery, adminFeedback]);

  const filteredAdminConversations = useMemo(() => {
    const keyword = adminConversationQuery.trim().toLowerCase();
    if (!keyword) return adminConversations;
    return adminConversations.filter((conversation) => [conversation.id, conversation.type, conversation.title, conversation.ownerId, conversation.memberCount, conversation.messageCount, conversation.members.map((member) => `${member.nickname} ${member.email ?? ""} ${member.phone ?? ""} ${member.userId}`).join(" ")].some((value) => String(value ?? "").toLowerCase().includes(keyword)));
  }, [adminConversationQuery, adminConversations]);

  const filteredAdminUserChats = useMemo(() => {
    if (!adminSelectedUserChats) return [];
    const keyword = adminUserChatQuery.trim().toLowerCase();
    if (!keyword) return adminSelectedUserChats.conversations;
    return adminSelectedUserChats.conversations.flatMap((conversation) => {
      const conversationMatches = [
        conversation.id,
        conversation.title,
        conversation.type,
        conversation.members.map((member) => `${member.nickname} ${member.email ?? ""} ${member.phone ?? ""} ${member.userId}`).join(" ")
      ].some((value) => String(value ?? "").toLowerCase().includes(keyword));
      const messages = conversationMatches ? conversation.messages : conversation.messages.filter((message) => [
        message.id,
        message.senderName,
        message.type,
        message.createdAt,
        message.body,
        message.mediaUrl,
        message.translations.map((translation) => `${translation.language} ${translation.body}`).join(" ")
      ].some((value) => String(value ?? "").toLowerCase().includes(keyword)));
      return conversationMatches || messages.length ? [{ ...conversation, messages }] : [];
    });
  }, [adminSelectedUserChats, adminUserChatQuery]);
  const [contactResults, setContactResults] = useState<SearchUser[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequestView[]>([]);
  const [friends, setFriends] = useState<SearchUser[]>([]);
  const [contactDetailsUser, setContactDetailsUser] = useState<SearchUser | null>(null);
  const [removeContactClearHistory, setRemoveContactClearHistory] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [groupTitleValue, setGroupTitleValue] = useState("");
  const [groupSelectedIds, setGroupSelectedIds] = useState<string[]>([]);
  const [groupCreating, setGroupCreating] = useState(false);
  const [groupError, setGroupError] = useState("");
  const [groupDetailsOpen, setGroupDetailsOpen] = useState(false);
  const [groupDetailsConversation, setGroupDetailsConversation] = useState<Conversation | null>(null);
  const [groupMembers, setGroupMembers] = useState<GroupMemberSummary[]>([]);
  const [groupMembersConversationId, setGroupMembersConversationId] = useState("");
  const [groupMembersLoading, setGroupMembersLoading] = useState(false);
  const [groupCallPicker, setGroupCallPicker] = useState<{ conversationId: string; media: CallMediaKind } | null>(null);
  const [groupCallMemberIds, setGroupCallMemberIds] = useState<string[]>([]);
  const [groupCallLoading, setGroupCallLoading] = useState(false);
  const [groupCallError, setGroupCallError] = useState("");
  const [groupInviteSelectedIds, setGroupInviteSelectedIds] = useState<string[]>([]);
  const [groupInviteSaving, setGroupInviteSaving] = useState(false);
  const [groupMemberRemovingId, setGroupMemberRemovingId] = useState<string | null>(null);
  const [groupAdminChangingId, setGroupAdminChangingId] = useState<string | null>(null);
  const [groupMemberActionMenu, setGroupMemberActionMenu] = useState<{ memberId: string; x: number; y: number } | null>(null);
  const [groupTitleEditValue, setGroupTitleEditValue] = useState("");
  const [groupAnnouncementValue, setGroupAnnouncementValue] = useState("");
  const [groupAnnouncementScrollValue, setGroupAnnouncementScrollValue] = useState(true);
  const [groupAnnouncementDismissedForId, setGroupAnnouncementDismissedForId] = useState<string | null>(null);
  const [groupAvatarUploading, setGroupAvatarUploading] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUserView[]>([]);
  const [friendDataLoading, setFriendDataLoading] = useState(false);
  const [friendDataError, setFriendDataError] = useState("");
  const [contactsLoading, setContactsLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [conversationsFailed, setConversationsFailed] = useState(false);
  const onlineUserIdsRef = useRef<Set<string>>(new Set());
  const [messageLoadStates, setMessageLoadStates] = useState<Record<string, MessageLoadState>>({});
  const [historyEndReached, setHistoryEndReached] = useState<Record<string, boolean>>({});
  const [historyCursors, setHistoryCursors] = useState<Record<string, string | undefined>>({});
  const socketRef = useRef<Socket | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const mediaUploadAbortControllerRef = useRef<AbortController | null>(null);
  const screenshotCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const screenshotImageRef = useRef<HTMLImageElement | null>(null);
  const screenshotOcrBusyRef = useRef(false);
  const screenshotGestureRef = useRef<ScreenshotGesture | null>(null);
  const screenshotHistoryGestureRef = useRef<ScreenshotHistoryState | null>(null);
  const screenshotTextInputRef = useRef<HTMLTextAreaElement | null>(null);
  const screenshotColorInputRef = useRef<HTMLInputElement | null>(null);
  const draftTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceChunksRef = useRef<BlobPart[]>([]);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceAudioContextRef = useRef<AudioContext | null>(null);
  const voiceAnimationFrameRef = useRef<number | null>(null);
  const voiceHoldRef = useRef(false);
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const speechRecognitionActiveRef = useRef(false);
  const speechResultIndexRef = useRef(0);
  const speechToTextRecorderRef = useRef<MediaRecorder | null>(null);
  const speechToTextChunksRef = useRef<BlobPart[]>([]);
  const speechToTextStreamRef = useRef<MediaStream | null>(null);
  const speechToTextStartRef = useRef(false);
  const speechToTextStopRequestedRef = useRef(false);
  const typingClearTimersRef = useRef<Record<string, number>>({});
  const groupAvatarInputRef = useRef<HTMLInputElement | null>(null);
  const contactMemoFileInputRef = useRef<HTMLInputElement | null>(null);
  const feedbackFileInputRef = useRef<HTMLInputElement | null>(null);
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);
  const contactAvatarFileInputRef = useRef<HTMLInputElement | null>(null);
  const avatarCropFrameRef = useRef<HTMLDivElement | null>(null);
  const avatarCropGestureRef = useRef<{ pointers: Map<number, AvatarCropOffset>; lastCenter: AvatarCropOffset | null; lastDistance: number | null; }>({ pointers: new Map(), lastCenter: null, lastDistance: null });
  const pendingScrollToBottomRef = useRef(false);
  const pendingScrollBehaviorRef = useRef<ScrollBehavior>("smooth");
  const scrollToBottomRequestRef = useRef(0);
  const translationEditScrollRef = useRef<{ conversationId: string; scrollTop: number; expiresAt: number } | null>(null);
  const selectedIdRef = useRef(selectedId);
  const mobilePaneRef = useRef(mobilePane);
  const tabRef = useRef(tab);
  const [workspaceViewReadyUserId, setWorkspaceViewReadyUserId] = useState("");
  const pendingQuoteJumpRef = useRef<string | null>(null);
  const groupMembersRequestRef = useRef(0);

  useEffect(() => {
    const userId = currentUser?.id;
    if (!userId) {
      setWorkspaceViewReadyUserId("");
      return;
    }

    const hasConversationShortcut = Boolean(new URLSearchParams(window.location.search).get("conversation")?.trim());
    const savedView = hasConversationShortcut ? null : readWorkspaceView(userId);
    if (savedView) {
      tabRef.current = savedView.tab;
      mobilePaneRef.current = savedView.mobilePane;
      setTab(savedView.tab);
      setMobilePane(savedView.mobilePane);
      if (savedView.conversationId) {
        selectedIdRef.current = savedView.conversationId;
        setSelectedId(savedView.conversationId);
      }
    }
    setWorkspaceViewReadyUserId(userId);
  }, [currentUser?.id]);

  useEffect(() => {
    const userId = currentUser?.id;
    if (!userId || workspaceViewReadyUserId !== userId || pendingShortcutConversationId) return;
    writeWorkspaceView(userId, { tab, conversationId: selectedId, mobilePane });
  }, [currentUser?.id, mobilePane, pendingShortcutConversationId, selectedId, tab, workspaceViewReadyUserId]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 8000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = new URLSearchParams(window.location.search).get("resetToken")?.trim() ?? "";
    if (token) setPasswordResetToken(token);
  }, []);

  useEffect(() => () => {
    speechRecognitionActiveRef.current = false;
    speechRecognitionRef.current?.abort();
    speechRecognitionRef.current = null;
    speechResultIndexRef.current = 0;
    speechToTextStopRequestedRef.current = true;
    const speechRecorder = speechToTextRecorderRef.current;
    if (speechRecorder && speechRecorder.state !== "inactive") {
      try {
        speechRecorder.stop();
      } catch {
        // The component is unmounting; the stream cleanup below is sufficient.
      }
    }
    speechToTextRecorderRef.current = null;
    speechToTextStreamRef.current?.getTracks().forEach((track) => track.stop());
    speechToTextStreamRef.current = null;
    voiceHoldRef.current = false;
  }, []);

  useEffect(() => {
    if (!profileNotice) return;
    const timer = window.setTimeout(() => setProfileNotice(""), 8000);
    return () => window.clearTimeout(timer);
  }, [profileNotice]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateComposerDevice = () => setIsMobileComposerDevice(isMobileComposerViewport());
    updateComposerDevice();
    window.addEventListener("resize", updateComposerDevice);
    window.addEventListener("orientationchange", updateComposerDevice);
    return () => {
      window.removeEventListener("resize", updateComposerDevice);
      window.removeEventListener("orientationchange", updateComposerDevice);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !currentUser?.id) return;
    const platform = isMobileComposerDevice ? "mobile" : "desktop";
    const storageKey = `glimpse.sendWithEnter.${currentUser.id}.${platform}`;
    const legacyStorageKey = `glimpse.sendWithEnter.${currentUser.id}`;
    const storedSendShortcut = window.localStorage.getItem(storageKey);
    const legacySendShortcut = window.localStorage.getItem(legacyStorageKey);
    const defaultSendWithEnter = !isMobileComposerDevice;
    setSendShortcutLoadedKey("");
    setSendWithEnter(storedSendShortcut === null
      ? (!isMobileComposerDevice && legacySendShortcut !== null ? legacySendShortcut === "1" : defaultSendWithEnter)
      : storedSendShortcut === "1");
    setSendShortcutLoadedKey(storageKey);
    setScreenshotShortcut(window.localStorage.getItem(`glimpse.screenshotShortcut.${currentUser.id}`) || "ALT+Q");
    try {
      setContactRemarks(JSON.parse(window.localStorage.getItem(`glimpse.contactRemarks.${currentUser.id}`) || "{}"));
    } catch {
      setContactRemarks({});
    }
    try {
      const parsed = JSON.parse(window.localStorage.getItem(`glimpse.contactMemos.${currentUser.id}`) || "{}");
      setContactMemos(parsed && typeof parsed === "object" ? parsed : {});
    } catch {
      setContactMemos({});
    }
    try {
      const parsed = JSON.parse(window.localStorage.getItem(`glimpse.contactMemoImages.${currentUser.id}`) || "{}");
      const normalized = parsed && typeof parsed === "object"
        ? Object.fromEntries(Object.entries(parsed).map(([userId, images]) => [userId, Array.isArray(images) ? images.filter((image): image is string => typeof image === "string").slice(0, 3) : []]))
        : {};
      setContactMemoImages(normalized);
    } catch {
      setContactMemoImages({});
    }
  }, [currentUser?.id, isMobileComposerDevice]);

  useEffect(() => {
    if (typeof window === "undefined" || !currentUser?.id) return;
    const platform = isMobileComposerDevice ? "mobile" : "desktop";
    const storageKey = `glimpse.sendWithEnter.${currentUser.id}.${platform}`;
    if (sendShortcutLoadedKey !== storageKey) return;
    window.localStorage.setItem(storageKey, sendWithEnter ? "1" : "0");
  }, [currentUser?.id, isMobileComposerDevice, sendShortcutLoadedKey, sendWithEnter]);
  useEffect(() => {
    if (!currentUser?.id) return;
    window.localStorage.setItem(`glimpse.screenshotShortcut.${currentUser.id}`, screenshotShortcut.trim() || "ALT+Q");
  }, [currentUser?.id, screenshotShortcut]);

  useEffect(() => {
    if (typeof window === "undefined" || !currentUser?.id) return;
    window.localStorage.setItem(`glimpse.contactRemarks.${currentUser.id}`, JSON.stringify(contactRemarks));
  }, [currentUser?.id, contactRemarks]);

  useEffect(() => {
    if (typeof window === "undefined" || !currentUser?.id || !accessToken) return;
    let cancelled = false;
    const readLocalRecord = <T,>(key: string, fallback: T): T => {
      try {
        const parsed = JSON.parse(window.localStorage.getItem(key) || "");
        return parsed as T;
      } catch {
        return fallback;
      }
    };
    const localBodies = readLocalRecord<Record<string, string>>(`glimpse.contactMemos.${currentUser.id}`, {});
    const localImages = readLocalRecord<Record<string, string[]>>(`glimpse.contactMemoImages.${currentUser.id}`, {});
    void apiJson<{ memos: Record<string, ContactMemoApiRecord> }>("/contacts/memos", accessToken)
      .then((result) => {
        if (cancelled) return;
        const remoteMemos = result.memos && typeof result.memos === "object" ? result.memos : {};
        const nextBodies = { ...localBodies };
        const nextImages: Record<string, string[]> = Object.fromEntries(
          Object.entries(localImages).map(([userId, images]) => [userId, Array.isArray(images) ? images.filter((image): image is string => typeof image === "string").slice(0, 3) : []])
        );
        for (const [userId, record] of Object.entries(remoteMemos)) {
          const body = typeof record?.body === "string" ? record.body : "";
          if (body) nextBodies[userId] = body;
          else delete nextBodies[userId];
          const images = Array.isArray(record?.images) ? record.images.filter((image): image is string => typeof image === "string").slice(0, 3) : [];
          if (images.length) nextImages[userId] = images;
          else delete nextImages[userId];
        }
        setContactMemos(nextBodies);
        setContactMemoImages(nextImages);

        const localIds = Array.from(new Set([...Object.keys(localBodies), ...Object.keys(localImages)]));
        const migrations = localIds.filter((userId) => !Object.prototype.hasOwnProperty.call(remoteMemos, userId) && (localBodies[userId]?.trim() || nextImages[userId]?.length));
        if (migrations.length) {
          void Promise.allSettled(migrations.map((userId) => apiJson<{ memo: ContactMemoApiRecord }>(`/contacts/${encodeURIComponent(userId)}/memo`, accessToken, {
            method: "PUT",
            body: JSON.stringify({ body: localBodies[userId] ?? "", images: nextImages[userId] ?? [] })
          })));
        }
      })
      .catch(() => {
        // Keep the local cache available when the account API is temporarily offline.
      });
    return () => { cancelled = true; };
  }, [accessToken, currentUser?.id]);

  useEffect(() => {
    if (typeof window === "undefined" || !currentUser?.id) return;
    try {
      window.localStorage.setItem(`glimpse.contactMemos.${currentUser.id}`, JSON.stringify(contactMemos));
      window.localStorage.setItem(`glimpse.contactMemoImages.${currentUser.id}`, JSON.stringify(contactMemoImages));
    } catch {
      setNotice(uiLabel(uiLanguage, { zh: "联系人备忘图片过大，无法保存到本机。", en: "The contact memo images are too large to save on this device.", hi: "Contact memo images are too large to save on this device." }));
    }
  }, [contactMemoImages, contactMemos, currentUser?.id, uiLanguage]);
  useEffect(() => {
    if (!currentUser?.id || !accessToken) {
      setContactTags({});
      return;
    }
    let cancelled = false;
    void apiJson<{ tags: Record<string, string[]> }>("/contacts/tags", accessToken)
      .then((result) => {
        if (!cancelled) setContactTags(result.tags ?? {});
      })
      .catch(() => {
        if (!cancelled) setContactTags({});
      });
    return () => { cancelled = true; };
  }, [accessToken, currentUser?.id]);
  useEffect(() => {
    setPreviewRotation(0);
    setPreviewVideoFit("auto");
    setPreviewVideoSize(null);
    setPreviewTransformOrigin("center center");
    previewPointersRef.current.clear();
    previewPinchRef.current = null;
  }, [previewMedia?.url]);
  useEffect(() => {
    if (!previewMedia?.gallery?.length) return;
    const container = mediaGalleryScrollRef.current;
    const index = Math.max(0, Math.min(previewMedia.gallery.length - 1, previewMedia.galleryIndex ?? 0));
    const target = container?.children[index] as HTMLElement | undefined;
    target?.scrollIntoView({ block: "start" });
  }, [previewMedia?.gallery, previewMedia?.galleryIndex]);
 const currentUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!screenshotSource) {
      screenshotImageRef.current = null;
      setScreenshotSourceSize({ width: 0, height: 0 });
      return;
    }
    const image = new Image();
    image.onload = () => {
      screenshotImageRef.current = image;
      setScreenshotSourceSize({ width: image.naturalWidth, height: image.naturalHeight });
      window.requestAnimationFrame(() => drawScreenshotCanvas(true));
    };
    image.src = screenshotSource;
    return () => {
      if (screenshotImageRef.current === image) screenshotImageRef.current = null;
    };
  }, [screenshotSource]);
  useEffect(() => {
    drawScreenshotCanvas(true);
  }, [screenshotAnnotations, screenshotOcrBlocks, screenshotSelection, screenshotSource, screenshotSourceSize.height, screenshotSourceSize.width, screenshotTextPoint]);
  useEffect(() => {
    if (!screenshotTextPoint) return;
    const timer = window.setTimeout(() => screenshotTextInputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [screenshotTextPoint]);
  useEffect(() => {
    if (!currentUser?.id) return;
    const handleScreenshotShortcut = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editingText = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';
      if (screenshotEditorOpen && !editingText && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undoScreenshotAnnotation();
        return;
      }
    if (event.key === 'Escape' && screenshotEditorOpen) {
      event.preventDefault();
      if (screenshotOcrLoading || screenshotOcrTranslateLoading) {
        setScreenshotOcrStatus({
          kind: "loading",
          message: uiLabel(uiLanguage, { zh: "图片识别/翻译仍在处理中，完成前编辑器不会关闭。", en: "Image recognition or translation is still running. The editor will remain open until it finishes.", hi: "छवि पहचान या अनुवाद अभी चल रहा है। पूरा होने तक एडिटर खुला रहेगा।" })
        });
        return;
      }
      closeScreenshotEditor();
      return;
      }
      if (event.repeat || screenshotEditorOpen || !matchesConfiguredShortcut(event, screenshotShortcut)) return;
      event.preventDefault();
      void openScreenshotEditor();
    };
    window.addEventListener('keydown', handleScreenshotShortcut);
    return () => window.removeEventListener('keydown', handleScreenshotShortcut);
  }, [currentUser?.id, screenshotAnnotations, screenshotEditorOpen, screenshotOcrLoading, screenshotOcrTranslateLoading, screenshotSelection, screenshotShortcut, uiLanguage]);
  const accessTokenRef = useRef(accessToken);
  const messagesByConversationRef = useRef(messagesByConversation);
  const conversationsRef = useRef(conversations);
  const messageStatusesRef = useRef(messageStatuses);
  const translationTargetLanguageRef = useRef(translationTargetLanguage);
  const notificationsEnabledRef = useRef(notificationsEnabled);
  const notificationSoundEnabledRef = useRef(notificationSoundEnabled);
  const notificationVibrationEnabledRef = useRef(notificationVibrationEnabled);
  const autoTranslationRequestsRef = useRef(new Set<string>());
  const autoTranslationQueueRef = useRef<PendingAutoTranslation[]>([]);
  const autoTranslationActiveRef = useRef(0);
  const autoTranslationTimerRef = useRef<number | null>(null);
  const manualTranslationCooldownRef = useRef<Record<string, number>>({});
  const peerConnectionsRef = useRef<Record<string, RTCPeerConnection>>({});
  const pendingIceCandidatesRef = useRef<Record<string, RTCIceCandidateInit[]>>({});
  const localCallStreamRef = useRef<MediaStream | null>(null);
  const activeCallRef = useRef<ActiveCall | null>(null);
  const callWakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [localCallStream, setLocalCallStream] = useState<MediaStream | null>(null);
  const [remoteCallStreams, setRemoteCallStreams] = useState<RemoteCallStream[]>([]);
  const [remoteCameraOffByUserId, setRemoteCameraOffByUserId] = useState<Record<string, boolean>>({});
  const [callError, setCallError] = useState("");
  const [callExpanded, setCallExpanded] = useState(false);
  const [focusedCallTileId, setFocusedCallTileId] = useState<string | null>(null);
  const [callPipPosition, setCallPipPosition] = useState({ x: 16, y: 88 });
  const [callPipSize, setCallPipSize] = useState({ width: 96, height: 171 });
  const [cameraFacing, setCameraFacing] = useState<CameraFacingMode>("user");
  const cameraFacingRef = useRef<CameraFacingMode>("user");
  const callPipDragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);
  const callPipResizeRef = useRef<{ pointerId: number; startX: number; startY: number; originWidth: number; moved: boolean } | null>(null);
  const callPipSuppressClickRef = useRef(false);
  const conversationLongPressTimerRef = useRef<number | null>(null);
  const conversationLongPressTriggeredRef = useRef(false);
  const videoPreviewLongPressTimerRef = useRef<number | null>(null);
  const videoPreviewLongPressTriggeredRef = useRef(false);
  const galleryLongPressTimerRef = useRef<number | null>(null);
  const galleryLongPressTriggeredRef = useRef(false);
  const galleryLongPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const favoriteLongPressTimerRef = useRef<number | null>(null);
  const favoriteLongPressTriggeredRef = useRef(false);
  const favoriteLongPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const mediaGalleryScrollRef = useRef<HTMLDivElement | null>(null);
  const previewPointersRef = useRef<Map<number, ScreenshotPoint>>(new Map());
  const previewPinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const messageLongPressTimerRef = useRef<number | null>(null);
  const groupMemberLongPressTimerRef = useRef<number | null>(null);
  const groupMemberLongPressTriggeredRef = useRef(false);
  const groupMemberPressRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const documentPreviewFloatingButtonRef = useRef<HTMLButtonElement | null>(null);
  const documentPreviewFloatingDragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);
  const documentPreviewFloatingSuppressClickRef = useRef(false);
  const messageLongPressTriggeredRef = useRef(false);
  const messageSwipeRef = useRef<{ pointerId: number; messageId: string; startX: number; startY: number; offset: number; swiping: boolean } | null>(null);

  useEffect(() => {
    if (groupDetailsOpen) return;
    if (groupMemberLongPressTimerRef.current) window.clearTimeout(groupMemberLongPressTimerRef.current);
    groupMemberLongPressTimerRef.current = null;
    groupMemberPressRef.current = null;
    groupMemberLongPressTriggeredRef.current = false;
    setGroupMemberActionMenu(null);
  }, [groupDetailsOpen]);

  useEffect(() => {
    if (!documentPreviewFloatingPosition) return;
    window.localStorage.setItem("glimpse.documentPreviewFloatingPosition", JSON.stringify(documentPreviewFloatingPosition));
  }, [documentPreviewFloatingPosition]);

  useEffect(() => {
    const keepFloatingPreviewInViewport = () => {
      setDocumentPreviewFloatingPosition((current) => {
        if (!current) return current;
        const element = documentPreviewFloatingButtonRef.current;
        const width = element?.offsetWidth ?? Math.min(352, window.innerWidth - 24);
        const height = element?.offsetHeight ?? 64;
        return {
          x: Math.max(12, Math.min(current.x, window.innerWidth - width - 12)),
          y: Math.max(12, Math.min(current.y, window.innerHeight - height - 12)),
        };
      });
    };
    window.addEventListener("resize", keepFloatingPreviewInViewport);
    window.addEventListener("orientationchange", keepFloatingPreviewInViewport);
    return () => {
      window.removeEventListener("resize", keepFloatingPreviewInViewport);
      window.removeEventListener("orientationchange", keepFloatingPreviewInViewport);
    };
  }, []);

  const t = appCopy[uiLanguage];
  const selfLabel = t.selfLabel;
  const meetingLabel = t.meetings;
  const sendShortcutLabel = isMobileComposerDevice ? t.mobileSendByButton : (sendWithEnter ? t.enterToSend : t.ctrlEnterToSend);
  function displayUserName(user?: { id?: string; nickname?: string } | null) {
    if (!user) return "";
    return user.id ? (contactRemarks[user.id]?.trim() || user.nickname || user.id) : (user.nickname || "");
  }
  function updateContactRemark(userId: string, value: string) {
    setContactRemarks((current) => {
      const next = { ...current };
      const trimmed = value.trim();
      if (trimmed) next[userId] = value;
      else delete next[userId];
      return next;
    });
  }
  function isSelfConversation(item: Conversation) {
    if (item.type !== "single" || !currentUser) return false;
    if (item.otherUser?.id === currentUser.id) return true;
    if (item.id === `direct:${currentUser.id}:${currentUser.id}`) return true;
    return /\s*\((me|Me|ME)\)\s*$/.test(item.name);
  }

  function stripLegacySelfSuffix(name: string) {
    return name.replace(/\s*\((me|Me|ME)\)\s*$/, "").trim();
  }

  function displayConversationName(item: Conversation) {
    if (item.type === "single" && isSelfConversation(item)) {
      const selfId = currentUser?.id ?? item.otherUser?.id;
      return selfId ? (contactRemarks[selfId]?.trim() || currentUser?.nickname || item.otherUser?.nickname || stripLegacySelfSuffix(item.name) || selfId) : stripLegacySelfSuffix(item.name);
    }
    if (item.type === "single" && item.otherUser?.id) return contactRemarks[item.otherUser.id]?.trim() || item.otherUser.nickname || stripLegacySelfSuffix(item.name);
    return item.name;
  }
  function syncCurrentUserInConversationList(user: PublicUser) {
    const avatarUrl = normalizeMediaUrl(user.avatarUrl ?? undefined) ?? user.avatarUrl ?? null;
    const syncedUser: SearchUser = { ...user, avatarUrl };
    setConversations((items) => items.map((item) => {
      const isSelf = item.type === "single" && (
        item.otherUser?.id === user.id ||
        item.id === `direct:${user.id}:${user.id}` ||
        /\s*\((me|Me|ME)\)\s*$/.test(item.name)
      );
      if (!isSelf && item.otherUser?.id !== user.id) return item;
      return {
        ...item,
        ...(isSelf ? { name: user.nickname || item.name, avatarUrl, online: user.online ?? item.online } : {}),
        otherUser: { ...(item.otherUser ?? {}), ...syncedUser } as SearchUser
      };
    }));
    setFriends((items) => items.map((item) => item.id === user.id ? { ...item, ...syncedUser, online: user.online ?? item.online } : item));
    setContactResults((items) => items.map((item) => item.id === user.id ? { ...item, ...syncedUser, online: user.online ?? item.online } : item));
    setFriendRequests((items) => items.map((request) => request.user.id === user.id ? { ...request, user: { ...request.user, ...syncedUser, online: user.online ?? request.user.online } } : request));
    setBlockedUsers((items) => items.map((block) => block.user.id === user.id ? { ...block, user: { ...block.user, ...syncedUser, online: user.online ?? block.user.online } } : block));
    setGroupMembers((items) => items.map((member) => ({
      ...member,
      user: member.user.id === user.id ? { ...member.user, ...syncedUser, online: user.online ?? member.user.online } : member.user,
      invitedBy: member.invitedBy?.id === user.id ? { ...member.invitedBy, ...syncedUser, online: user.online ?? member.invitedBy.online } : member.invitedBy
    })));
    setMessagesByConversation((items) => Object.fromEntries(Object.entries(items).map(([conversationId, messages]) => [
      conversationId,
      messages.map((message) => message.senderId === user.id ? { ...message, senderName: user.nickname } : message)
    ])));
    setFavoriteMessages((items) => items.map((item) => item.message.senderId === user.id ? { ...item, message: { ...item.message, senderName: user.nickname } } : item));
    setContactDetailsUser((current) => current?.id === user.id ? { ...current, ...syncedUser, online: user.online ?? current.online } : current);
  }
  function renderMentionText(text: string, mine: boolean) {
    if (!text || selected.type !== "group" || groupMembers.length === 0) return text;
    const mentionTargets = groupMembers
      .flatMap((member) => {
        const names = [displayUserName(member.user), member.user.nickname, member.user.id]
          .filter((name): name is string => Boolean(name?.trim()))
          .map((name) => name.trim());
        return Array.from(new Set(names)).map((name) => ({ member, token: `@${name}` }));
      })
      .filter((item) => item.token.length > 1)
      .sort((left, right) => right.token.length - left.token.length);
    if (mentionTargets.length === 0) return text;
    const parts: ReactNode[] = [];
    let index = 0;
    while (index < text.length) {
      const hit = mentionTargets.find((item) => text.startsWith(item.token, index));
      if (!hit) {
        const nextMention = mentionTargets.reduce((next, item) => {
          const found = text.indexOf(item.token, index + 1);
          return found >= 0 ? Math.min(next, found) : next;
        }, text.length);
        parts.push(text.slice(index, nextMention));
        index = nextMention;
        continue;
      }
      parts.push(
        <button key={`${hit.member.user.id}-${index}`} className={`inline rounded px-1 font-semibold underline-offset-2 hover:underline ${mine ? "bg-white/15 text-white" : "bg-brand/10 text-brand"}`} onClick={(event) => { event.stopPropagation(); openUserDetails(hit.member.user); }} type="button">
          {hit.token}
        </button>
      );
      index += hit.token.length;
    }
    return parts;
  }
 const authText = authCopy[uiLanguage];
  const selected = conversations.find((item) => item.id === selectedId) ?? conversations[0] ?? defaultConversation;
  const selectedStickerCategoryDefinition = STICKER_CATEGORIES.find((category) => category.id === selectedStickerCategory);
  const selectedStickerCategoryTitle = selectedStickerCategoryDefinition
    ? stickerCategoryLabel(selectedStickerCategoryDefinition, uiLanguage)
    : uiLabel(uiLanguage, { zh: "表情包", en: "Stickers", hi: "स्टिकर" });
  const normalizedStickerSearch = stickerSearchQuery.trim().toLocaleLowerCase();
  const visiblePanelStickers = BUILT_IN_STICKERS.filter((sticker) => {
    const matchesCategory = selectedStickerCategory === "favorites"
      ? favoriteStickerIds.has(sticker.id)
      : sticker.category === selectedStickerCategory;
    const matchesSearch = !normalizedStickerSearch
      || [sticker.zh, sticker.en, sticker.hi].some((label) => label.toLocaleLowerCase().includes(normalizedStickerSearch));
    return (normalizedStickerSearch ? true : matchesCategory) && matchesSearch;
  });
  const chatHeaderSubtitle = selected.type === "group"
    ? selected.announcement?.trim() || uiLabel(uiLanguage, { zh: "暂无群公告", en: "No group announcement", hi: "अभी कोई समूह घोषणा नहीं है।" })
    : (isSelfConversation(selected) ? profileSignature.trim() : selected.otherUser?.signature?.trim()) || uiLabel(uiLanguage, { zh: "这家伙很懒，什么都没留下来。", en: "This person has not left a signature yet.", hi: "इस व्यक्ति ने अभी तक कोई हस्ताक्षर नहीं छोड़ा है।" });
 const currentMessages = (messagesByConversation[selected.id] ?? []).filter((message) => !hiddenMessageIds.has(message.id));
  const pendingVisualMediaCount = pendingComposerFiles.filter((file) => ["image", "video"].includes(mediaTypeFromFile(file))).length;
  const speechToTextButtonVisible = !draft.trim() || speechToTextListening || speechToTextLoading;
 const renderedAlbumIds = new Set<string>();
  const previewRotationClass = previewRotation % 180 === 0 ? "max-h-[82vh] max-w-[96vw]" : "max-h-[96vw] max-w-[82vh]";
  const allLoadedMessages = useMemo(() => Object.values(messagesByConversation).flat().sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()), [messagesByConversation]);
  const scopedMessages = mediaLibraryScope === "all" ? allLoadedMessages : currentMessages;
  const mediaLibraryMessages = scopedMessages.filter((message) => message.mediaUrl && ["image", "video", "audio", "file"].includes(message.type));
  const filteredMediaLibraryMessages = mediaLibraryFilter === "all" ? mediaLibraryMessages : mediaLibraryMessages.filter((message) => message.type === mediaLibraryFilter);
  const sortedMediaLibraryMessages = [...filteredMediaLibraryMessages].sort((left, right) => {
    if (mediaLibrarySort === "size-asc" || mediaLibrarySort === "size-desc") {
      const difference = (left.mediaSizeBytes ?? -1) - (right.mediaSizeBytes ?? -1);
      return mediaLibrarySort === "size-asc" ? difference : -difference;
    }
    const difference = (left.body ?? "").localeCompare(right.body ?? "", uiLanguage === "zh" ? "zh-CN" : uiLanguage === "hi" ? "hi-IN" : "en");
    return mediaLibrarySort === "name-asc" ? difference : -difference;
  });
  const mediaLibraryFilters: Array<{ key: MediaLibraryFilter; label: string }> = [
    { key: "all", label: t.mediaAll },
    { key: "image", label: t.mediaImages },
    { key: "video", label: t.mediaVideos },
    { key: "audio", label: t.mediaAudios },
    { key: "file", label: t.mediaDocs }
  ];
  const messageSearchTypes: Array<{ key: MessageSearchType; label: string }> = [
    { key: "all", label: uiLabel(uiLanguage, { zh: "全部", en: "All", hi: "सभी" }) },
    { key: "text", label: uiLabel(uiLanguage, { zh: "文字", en: "Text", hi: "टेक्स्ट" }) },
    { key: "image", label: uiLabel(uiLanguage, { zh: "图片", en: "Images", hi: "चित्र" }) },
    { key: "video", label: uiLabel(uiLanguage, { zh: "视频", en: "Videos", hi: "वीडियो" }) },
    { key: "audio", label: uiLabel(uiLanguage, { zh: "语音", en: "Audio", hi: "ऑडियो" }) },
    { key: "file", label: uiLabel(uiLanguage, { zh: "文件", en: "Files", hi: "फाइलें" }) }
  ];
  const messageSearchActive = Boolean(messageSearchQuery.trim() || messageSearchDate || messageSearchType !== "all");
  const messageSearchResults = useMemo(() => {
    const keyword = messageSearchQuery.trim().toLowerCase();
    if (!keyword && !messageSearchDate && messageSearchType === "all") return [] as MessagePayload[];
    return scopedMessages
      .filter((message) => {
        if (messageSearchType !== "all" && message.type !== messageSearchType) return false;
        if (messageSearchDate && !message.createdAt.startsWith(messageSearchDate)) return false;
        if (!keyword) return true;
        const translatedText = message.translations ? Object.values(message.translations).filter(Boolean).join(" ") : "";
        const haystack = [message.body, message.senderName, message.transcript, translatedText].filter(Boolean).join(" ").toLowerCase();
        return haystack.includes(keyword);
      })
      .slice(-30)
      .reverse();
  }, [messageSearchDate, messageSearchQuery, messageSearchType, scopedMessages]);
  const filteredFavoriteMessages = useMemo(() => {
    const keyword = favoriteSearchQuery.trim().toLowerCase();
    if (!keyword) return favoriteMessages;
    return favoriteMessages.filter((item) => {
      const tags = item.tags ?? [];
      const translatedText = item.message.translations ? Object.values(item.message.translations).filter(Boolean).join(" ") : "";
      const haystack = [item.conversation?.title, item.message.senderName, item.message.body, translatedText, mediaPreviewLabel(item.message), item.message.transcript, ...tags].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(keyword);
    });
  }, [favoriteMessages, favoriteSearchQuery]);
  const selectedExists = conversations.some((item) => item.id === selected.id);
  const mentionCandidates = groupMembers.filter((member) => member.user.id !== currentUser?.id);
  useEffect(() => {
    if (!accessToken || !selectedExists || selected.type !== "group") {
      if (groupMembersConversationId || groupMembers.length > 0) {
        setGroupMembers([]);
        setGroupMembersConversationId("");
      }
      if (mentionPickerOpen) setMentionPickerOpen(false);
      return;
    }
    if (groupDetailsOpen || groupCallPicker || groupMembersLoading || groupMembersConversationId === selected.id) return;
    setGroupMembers([]);
    setGroupMembersConversationId("");
    void loadGroupMembers(selected.id);
  }, [accessToken, groupCallPicker, groupDetailsOpen, groupMembers.length, groupMembersConversationId, groupMembersLoading, mentionPickerOpen, selected.id, selected.type, selectedExists]);
  const selectedMessageLoadState = messageLoadStates[selected.id] ?? "ready";
  const contactConversations = useMemo(() => conversations.filter((item) => item.type === "single"), [conversations]);
  const visibleFriends = useMemo(() => friends.filter((friend) => !hiddenContactUserIds.has(friend.id)), [friends, hiddenContactUserIds]);
  const contactTagOptions = useMemo(() => Array.from(new Set(visibleFriends.flatMap((friend) => (contactTags[friend.id] ?? []).filter((tag) => tag !== STARRED_CONTACT_TAG)))).sort((left, right) => left.localeCompare(right, "zh-Hans")), [contactTags, visibleFriends]);
  const contactListFriends = useMemo(() => {
    if (contactTagFilters.length === 0) return [...visibleFriends].sort((left, right) => Number((contactTags[right.id] ?? []).includes(STARRED_CONTACT_TAG)) - Number((contactTags[left.id] ?? []).includes(STARRED_CONTACT_TAG)));
    const selectedTags = new Set(contactTagFilters.map((tag) => tag.toLocaleLowerCase()));
    return visibleFriends.filter((friend) => (contactTags[friend.id] ?? []).some((tag) => tag !== STARRED_CONTACT_TAG && selectedTags.has(tag.toLocaleLowerCase())));
  }, [contactTagFilters, contactTags, visibleFriends]);
  const toggleContactTagFilter = (tag: string) => {
    setContactTagFilters((current) => {
      const normalized = tag.toLocaleLowerCase();
      const alreadySelected = current.some((item) => item.toLocaleLowerCase() === normalized);
      return alreadySelected
        ? current.filter((item) => item.toLocaleLowerCase() !== normalized)
        : [...current, tag];
    });
  };
  const contactInitialGroups = useMemo(() => {
    const groups = new Map<string, SearchUser[]>();
    for (const friend of contactListFriends) {
      const initial = (contactTags[friend.id] ?? []).includes(STARRED_CONTACT_TAG) ? "★" : contactNameInitial(displayUserName(friend));
      const list = groups.get(initial) ?? [];
      list.push(friend);
      groups.set(initial, list);
    }
    return Array.from(groups.entries())
      .map(([initial, users]) => ({
        initial,
        users: users.sort((left, right) => displayUserName(left).localeCompare(displayUserName(right), "zh-Hans"))
      }))
      .sort((left, right) => left.initial === "★" ? -1 : right.initial === "★" ? 1 : left.initial === "#" ? 1 : right.initial === "#" ? -1 : left.initial.localeCompare(right.initial));
  }, [contactListFriends, contactRemarks, contactTags]);
  const groupCandidateUsers = useMemo(() => {
    const byId = new Map<string, SearchUser>();
    for (const friend of visibleFriends) {
      if (friend.id === currentUser?.id) continue;
      byId.set(friend.id, friend);
    }
    return Array.from(byId.values());
  }, [currentUser?.id, visibleFriends]);
  const selectedContactUser = selected.type === "single" && isSelfConversation(selected) && currentUser
    ? currentUser
    : selected.otherUser ?? (selectedExists ? { id: selected.id, nickname: selected.name, avatarUrl: selected.avatarUrl, language: "en" as UserLanguage, online: selected.online } : null);
  const selectedPeerOnline = selected.type === "single" ? Boolean(selected.otherUser?.id && onlineUserIds.has(selected.otherUser.id)) || Boolean(selected.online) : false;
  const ownOnline = connectionState === "connected";
  const ownAvatarUrl = profileAvatarPreviewUrl || profileAvatarUrl || currentUser?.avatarUrl || "";
  function messageSenderUser(message: MessagePayload) {
    if (message.senderId === currentUser?.id) return currentUser;
    if (selected.type === "group") return groupMembers.find((member) => member.user.id === message.senderId)?.user ?? null;
    return selected.otherUser?.id === message.senderId ? selected.otherUser : null;
  }
  function displayMessageSenderName(message: MessagePayload) {
    const knownUser = messageSenderUser(message);
    return knownUser ? displayUserName(knownUser) : message.senderName ?? message.senderId;
  }
  function displayGlobalSearchName(result: GlobalSearchResult) {
    if (result.user) return displayUserName(result.user);
    const conversation = result.conversationId ? conversations.find((item) => item.id === result.conversationId) : undefined;
    return conversation ? displayConversationName(conversation) : result.title;
  }
  const callUserDirectory = useMemo(() => {
    const byId = new Map<string, SearchUser>();
    for (const friend of friends) byId.set(friend.id, friend);
    for (const item of contactConversations) {
      if (item.otherUser) byId.set(item.otherUser.id, item.otherUser);
    }
    for (const member of groupMembers) byId.set(member.user.id, member.user);
    if (selectedContactUser) byId.set(selectedContactUser.id, selectedContactUser);
    return byId;
  }, [contactConversations, friends, groupMembers, selectedContactUser]);
  const callTiles: CallTileView[] = activeCall ? [
    ...remoteCallStreams.map((remote) => {
      const user = callUserDirectory.get(remote.userId);
      const cameraOff = remote.cameraOff ?? remoteCameraOffByUserId[remote.userId] ?? false;
      return { id: `remote:${remote.userId}`, name: remote.name, stream: remote.stream, muted: false, videoEnabled: remote.media === "video" && !cameraOff, avatarUrl: user?.avatarUrl };
    }),
    { id: "local", name: callLabels[uiLanguage].localUser, stream: localCallStream, muted: true, videoEnabled: activeCall.media === "video" && !activeCall.cameraOff, avatarUrl: ownAvatarUrl, isLocal: true }
  ] : [];
  const focusedCallTile = callTiles.find((tile) => tile.id === focusedCallTileId) ?? callTiles.find((tile) => !tile.isLocal) ?? callTiles[0] ?? null;
  const secondaryCallTiles = focusedCallTile ? callTiles.filter((tile) => tile.id !== focusedCallTile.id) : callTiles;
  const floatingCallTile = callExpanded ? secondaryCallTiles[0] ?? null : null;
  function clampCallPipPosition(x: number, y: number) {
    if (typeof window === "undefined") return { x, y };
    const pipWidth = callPipSize.width;
    const pipHeight = callPipSize.height;
    const margin = 12;
    return {
      x: Math.min(Math.max(margin, x), Math.max(margin, window.innerWidth - pipWidth - margin)),
      y: Math.min(Math.max(64, y), Math.max(64, window.innerHeight - pipHeight - 84))
    };
  }
  function beginCallPipDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const pointer = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: callPipPosition.x, originY: callPipPosition.y, moved: false };
    callPipDragRef.current = pointer;
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveCallPip(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = callPipDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dx) + Math.abs(dy) > 6) {
      drag.moved = true;
      callPipSuppressClickRef.current = true;
    }
    setCallPipPosition(clampCallPipPosition(drag.originX + dx, drag.originY + dy));
  }
  function endCallPipDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = callPipDragRef.current;
    if (drag?.pointerId === event.pointerId) callPipDragRef.current = null;
  }
  function clampCallPipWidth(width: number) {
    if (typeof window === "undefined") return Math.min(Math.max(96, width), 220);
    const maxByWidth = window.innerWidth - 24;
    const maxByHeight = Math.max(96, Math.floor((window.innerHeight - 148) * 9 / 16));
    const maxWidth = Math.min(260, maxByWidth, maxByHeight);
    return Math.min(Math.max(96, width), maxWidth);
  }
  function beginCallPipResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.stopPropagation();
    callPipResizeRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originWidth: callPipSize.width, moved: false };
    callPipSuppressClickRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveCallPipResize(event: ReactPointerEvent<HTMLDivElement>) {
    const resize = callPipResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    const delta = Math.max(event.clientX - resize.startX, event.clientY - resize.startY);
    if (Math.abs(delta) > 4) {
      resize.moved = true;
      callPipSuppressClickRef.current = true;
    }
    const width = clampCallPipWidth(resize.originWidth + delta);
    const nextSize = { width, height: Math.round(width * 16 / 9) };
    setCallPipSize(nextSize);
    setCallPipPosition((position) => {
      if (typeof window === "undefined") return position;
      const margin = 12;
      return {
        x: Math.min(Math.max(margin, position.x), Math.max(margin, window.innerWidth - nextSize.width - margin)),
        y: Math.min(Math.max(64, position.y), Math.max(64, window.innerHeight - nextSize.height - 84))
      };
    });
  }
  function endCallPipResize(event: ReactPointerEvent<HTMLDivElement>) {
    const resize = callPipResizeRef.current;
    if (resize?.pointerId === event.pointerId) callPipResizeRef.current = null;
  }
  const avatarCropBaseScale = avatarCropImageSize.width && avatarCropImageSize.height ? Math.max(avatarCropFrameSize / avatarCropImageSize.width, avatarCropFrameSize / avatarCropImageSize.height) : 1;
  const avatarCropPreviewWidth = avatarCropImageSize.width ? avatarCropImageSize.width * avatarCropBaseScale : avatarCropFrameSize;
  const avatarCropPreviewHeight = avatarCropImageSize.height ? avatarCropImageSize.height * avatarCropBaseScale : avatarCropFrameSize;

  const visibleConversations = useMemo(() => conversations
    .filter((item) => !hiddenConversationIds.has(item.id))
    .sort((left, right) => compareConversations(left, right, pinnedConversationIds)), [conversations, hiddenConversationIds, pinnedConversationIds]);
  const globalSearchActive = Boolean(globalQuery.trim());
  const globalSearchResults = useMemo(() => {
    const keyword = globalQuery.trim().toLowerCase();
    if (!keyword) return [] as GlobalSearchResult[];
    const results: GlobalSearchResult[] = [];
    const seen = new Set<string>();
    const push = (item: GlobalSearchResult) => {
      if (seen.has(item.id)) return;
      seen.add(item.id);
      results.push(item);
    };
    for (const item of serverGlobalSearchResults) push(item);
    for (const item of visibleConversations) {
      if ([item.name, item.preview].join(" ").toLowerCase().includes(keyword)) {
        push({ id: `conversation-${item.id}`, kind: "conversation", title: displayConversationName(item), subtitle: item.preview || (item.type === "group" ? uiLabel(uiLanguage, { zh: "群聊", en: "Group", hi: "समूह" }) : uiLabel(uiLanguage, { zh: "聊天", en: "Chat", hi: "चैट" })), conversationId: item.id, avatarUrl: item.type === "single" && isSelfConversation(item) ? ownAvatarUrl : item.avatarUrl, avatarKind: item.type === "group" ? "group" : "user" });
      }
    }
    for (const user of visibleFriends) {
      const haystack = [user.nickname, user.email, user.phone, user.publicId, user.id, user.signature, contactRemarks[user.id], contactMemos[user.id], ...(contactTags[user.id] ?? [])].filter(Boolean).join(" ").toLowerCase();
      if (haystack.includes(keyword)) push({ id: `contact-${user.id}`, kind: "contact", title: displayUserName(user), subtitle: user.email ?? user.phone ?? user.publicId ?? user.id, user, avatarUrl: user.avatarUrl, avatarKind: "user" });
    }
    for (const [conversationId, messages] of Object.entries(messagesByConversation)) {
      const conversation = conversations.find((item) => item.id === conversationId);
      for (const message of messages) {
        const translatedText = message.translations ? Object.values(message.translations).filter(Boolean).join(" ") : "";
        const haystack = [message.body, message.senderName, message.transcript, translatedText, mediaPreviewLabel(message)].filter(Boolean).join(" ").toLowerCase();
        if (haystack.includes(keyword)) push({ id: `message-${message.id}`, kind: "message", title: conversation?.name ?? message.senderName ?? uiLabel(uiLanguage, { zh: "聊天记录", en: "Chat message", hi: "चैट संदेश" }), subtitle: mediaPreviewLabel(message) || message.transcript || `[${message.type}]`, conversationId: message.conversationId, messageId: message.id, avatarUrl: conversation?.avatarUrl, avatarKind: conversation?.type === "group" ? "group" : "user" });
      }
    }
    for (const favorite of favoriteMessages) {
      const tags = favorite.tags ?? [];
      const translatedText = favorite.message.translations ? Object.values(favorite.message.translations).filter(Boolean).join(" ") : "";
      const haystack = [favorite.conversation?.title, favorite.message.senderName, favorite.message.body, translatedText, mediaPreviewLabel(favorite.message), favorite.message.transcript, ...tags].filter(Boolean).join(" ").toLowerCase();
      if (haystack.includes(keyword)) push({ id: `favorite-${favorite.id}`, kind: "favorite", title: favorite.conversation?.title ?? uiLabel(uiLanguage, { zh: "收藏", en: "Favorite", hi: "पसंदीदा" }), subtitle: `${tags.length ? `#${tags.join(" #")} · ` : ""}${mediaPreviewLabel(favorite.message)}`, favorite, conversationId: favorite.message.conversationId, messageId: favorite.message.id, avatarKind: "group" });
    }
    return results.slice(0, 80);
  }, [contactMemos, contactRemarks, contactTags, conversations, favoriteMessages, globalQuery, messagesByConversation, serverGlobalSearchResults, uiLanguage, visibleConversations, visibleFriends]);
  const filtered = visibleConversations;
  const filteredForwardConversations = useMemo(() => {
    const keyword = forwardQuery.trim().toLowerCase();
    if (!keyword) return visibleConversations;
    return visibleConversations.filter((conversation) => {
      const otherUser = conversation.otherUser;
      const haystack = [
        displayConversationName(conversation),
        conversation.name,
        conversation.preview,
        otherUser?.nickname,
        otherUser?.email,
        otherUser?.phone,
        otherUser?.publicId,
        otherUser?.id,
        otherUser?.signature,
        otherUser ? contactRemarks[otherUser.id] : "",
        otherUser ? contactMemos[otherUser.id] : "",
        ...(otherUser ? contactTags[otherUser.id] ?? [] : [])
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(keyword);
    });
  }, [contactMemos, contactRemarks, contactTags, forwardQuery, visibleConversations]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    if (!pendingContactCall || selected.id !== pendingContactCall.conversationId) return;
    const media = pendingContactCall.media;
    const participantUserIds = pendingContactCall.participantUserIds;
    setPendingContactCall(null);
    window.setTimeout(() => void startCall(media, participantUserIds), 0);
  }, [pendingContactCall, selected.id]);

  useEffect(() => {
    cancelMessageSelection();
    setMessageActionMenuId(null);
  }, [selectedId]);

  useEffect(() => {
    if (!pendingShortcutConversationId) return;
    if (!conversations.some((item) => item.id === pendingShortcutConversationId)) return;
    selectConversation(pendingShortcutConversationId);
    setPendingShortcutConversationId("");
  }, [conversations, pendingShortcutConversationId]);

  useEffect(() => {
    mobilePaneRef.current = mobilePane;
  }, [mobilePane]);

  useEffect(() => {
    translationTargetLanguageRef.current = translationTargetLanguage;
    window.localStorage.setItem("glimpse.translationTargetLanguage", translationTargetLanguage);
  }, [translationTargetLanguage]);
  useEffect(() => {
    if (!translationTargetLanguagePreferenceRef.current) setTranslationTargetLanguage(uiLanguage);
  }, [uiLanguage]);

  useEffect(() => {
    window.localStorage.setItem("glimpse.messageDisplayMode", messageDisplayMode);
  }, [messageDisplayMode]);
  useEffect(() => {
    window.localStorage.setItem("glimpse.messageActionDisplayMode", messageActionDisplayMode);
    setMessageActionMenuId(null);
  }, [messageActionDisplayMode]);
  useEffect(() => {
    window.localStorage.setItem("glimpse.messageTimeDisplayMode", messageTimeDisplayMode);
  }, [messageTimeDisplayMode]);
  useEffect(() => {
    window.localStorage.setItem("glimpse.showMessageReadStatus", showMessageReadStatus ? "true" : "false");
  }, [showMessageReadStatus]);
  useEffect(() => {
    window.localStorage.setItem("glimpse.showSenderNames", showSenderNames ? "true" : "false");
  }, [showSenderNames]);

  useEffect(() => {
    stickerFavoriteMutationVersionRef.current += 1;
    skipNextStickerFavoriteSaveRef.current = true;
    setFavoriteStickerIds(currentUser?.id ? readStoredIdSet(stickerFavoritesStorageKey(currentUser.id)) : new Set());
  }, [currentUser?.id]);
  useEffect(() => {
    if (!currentUser?.id) return;
    if (skipNextStickerFavoriteSaveRef.current) {
      skipNextStickerFavoriteSaveRef.current = false;
      return;
    }
    writeStoredIdSet(stickerFavoritesStorageKey(currentUser.id), favoriteStickerIds);
  }, [currentUser?.id, favoriteStickerIds]);
  useEffect(() => {
    if (!currentUser?.id || !accessToken) return;
    let cancelled = false;
    const loadVersion = stickerFavoriteMutationVersionRef.current;
    void apiJson<{ stickerIds: string[] }>("/favorites/stickers", accessToken)
      .then(({ stickerIds }) => {
        if (cancelled || stickerFavoriteMutationVersionRef.current !== loadVersion) return;
        const knownStickerIds = new Set(BUILT_IN_STICKERS.map((sticker) => sticker.id));
        const next = new Set(stickerIds.filter((stickerId) => knownStickerIds.has(stickerId)));
        setFavoriteStickerIds(next);
        writeStoredIdSet(stickerFavoritesStorageKey(currentUser.id), next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [accessToken, currentUser?.id]);
  useEffect(() => {
    if (stickerPanelOpen) return;
    setStickerActionMenu(null);
    setStickerSearchOpen(false);
    setStickerSearchQuery("");
  }, [stickerPanelOpen]);

  useEffect(() => {
    if (!currentUser) return;
    setProfilePublicId(currentUser.publicId ?? "");
    setProfileIsPublic(currentUser.profilePublic !== false);
    setProfileEmailPublic(currentUser.profileEmailPublic === true);
    setProfilePhonePublic(currentUser.profilePhonePublic === true);
    setProfileNicknameValue(currentUser.nickname ?? "");
    setProfilePhoneValue(currentUser.phone ?? "");
    setProfileAvatarPreviewUrl(getStoredAvatarPreview(currentUser.id));
    setProfileAvatarUrl(normalizeMediaUrl(currentUser.avatarUrl ?? undefined) ?? "");
    setProfileCompany(currentUser.company ?? "");
    setProfileTitle(currentUser.title ?? "");
    setProfileLocation(currentUser.location ?? "");
    setProfileBio(currentUser.bio ?? "");
    setProfileSignature(currentUser.signature ?? "");
  }, [currentUser]);
  useEffect(() => {
    window.localStorage.setItem("glimpse.speechAccent", speechAccent);
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeakingMessageKey("");
  }, [speechAccent]);

  useEffect(() => {
    setRemoveContactClearHistory(false);
  }, [contactDetailsUser?.id]);
  useEffect(() => {
    setContactTagDraft("");
  }, [contactDetailsUser?.id]);
  useEffect(() => {
    const userId = contactDetailsUser?.id;
    setContactMemoDraft(userId ? contactMemos[userId] ?? "" : "");
    setContactMemoImagesDraft(userId ? contactMemoImages[userId] ?? [] : []);
  }, [contactDetailsUser?.id, contactMemoImages, contactMemos]);

  useEffect(() => {
    notificationsEnabledRef.current = notificationsEnabled;
    window.localStorage.setItem("glimpse.notificationsEnabled", String(notificationsEnabled));
  }, [notificationsEnabled]);

  useEffect(() => {
    notificationSoundEnabledRef.current = notificationSoundEnabled;
    window.localStorage.setItem("glimpse.notificationSoundEnabled", String(notificationSoundEnabled));
  }, [notificationSoundEnabled]);

  useEffect(() => {
    notificationVibrationEnabledRef.current = notificationVibrationEnabled;
    window.localStorage.setItem("glimpse.notificationVibrationEnabled", String(notificationVibrationEnabled));
  }, [notificationVibrationEnabled]);

  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);

  useEffect(() => {
    onlineUserIdsRef.current = onlineUserIds;
  }, [onlineUserIds]);

  useEffect(() => {
    currentUserIdRef.current = currentUser?.id ?? null;
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser?.id) {
      setPinnedConversationIds(new Set());
      setHiddenConversationIds(new Set());
      setHiddenContactUserIds(new Set());
      return;
    }
    setPinnedConversationIds(readStoredIdSet(conversationPinsStorageKey(currentUser.id)));
    setHiddenConversationIds(readStoredIdSet(conversationHiddenStorageKey(currentUser.id)));
    setHiddenContactUserIds(readStoredIdSet(hiddenContactsStorageKey(currentUser.id)));
    setHiddenMessageIds(readStoredIdSet(hiddenMessagesStorageKey(currentUser.id)));
  }, [currentUser?.id]);

  useEffect(() => {
    if (currentUser?.id) writeStoredIdSet(conversationPinsStorageKey(currentUser.id), pinnedConversationIds);
  }, [currentUser?.id, pinnedConversationIds]);

  useEffect(() => {
    if (!accessToken) {
      setFavoriteMessages([]);
      setFavoriteMessageIds(new Set());
      return;
    }
    void loadFavorites(accessToken);
  }, [accessToken]);

  useEffect(() => {
    if (!currentUser?.id) {
      setMessageReminders([]);
      return;
    }
    try {
      const stored = window.localStorage.getItem(messageRemindersStorageKey(currentUser.id));
      const parsed = stored ? JSON.parse(stored) : [];
      setMessageReminders(Array.isArray(parsed) ? parsed : []);
    } catch {
      setMessageReminders([]);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    if (currentUser?.id) window.localStorage.setItem(messageRemindersStorageKey(currentUser.id), JSON.stringify(messageReminders));
  }, [currentUser?.id, messageReminders]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      setMessageReminders((items) => items.map((item) => {
        if (item.done || new Date(item.remindAt).getTime() > now) return item;
        const title = messageActionLabels[uiLanguage].reminderDue;
        const body = `${item.title}: ${item.body}`;
        if (notificationSoundEnabledRef.current) playNotificationSound();
        if (typeof window !== "undefined" && "Notification" in window && window.Notification.permission === "granted") {
          new window.Notification(title, { body, tag: `glimpse-reminder-${item.id}` });
        } else {
          setNotice(`${title}: ${body}`);
        }
        return { ...item, done: true };
      }));
    }, 30000);
    return () => window.clearInterval(timer);
  }, [uiLanguage]);

  useEffect(() => {
    if (currentUser?.id) writeStoredIdSet(conversationHiddenStorageKey(currentUser.id), hiddenConversationIds);
  }, [currentUser?.id, hiddenConversationIds]);


  useEffect(() => {
    if (currentUser?.id) writeStoredIdSet(hiddenContactsStorageKey(currentUser.id), hiddenContactUserIds);
  }, [currentUser?.id, hiddenContactUserIds]);

  useEffect(() => {
    if (currentUser?.id) writeStoredIdSet(hiddenMessagesStorageKey(currentUser.id), hiddenMessageIds);
  }, [currentUser?.id, hiddenMessageIds]);

  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);


  useEffect(() => {
    return () => {
      if (pendingVoicePreview?.url) URL.revokeObjectURL(pendingVoicePreview.url);
    };
  }, [pendingVoicePreview?.url]);

  useEffect(() => {
    messagesByConversationRef.current = messagesByConversation;
  }, [messagesByConversation]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    setConversations((items) => items.map((item) => item.type === "single" && item.otherUser ? { ...item, online: onlineUserIds.has(item.otherUser.id), otherUser: { ...item.otherUser, online: onlineUserIds.has(item.otherUser.id) } } : item));
    setFriends((items) => items.map((item) => ({ ...item, online: onlineUserIds.has(item.id) })));
    setContactResults((items) => items.map((item) => ({ ...item, online: onlineUserIds.has(item.id) })));
  }, [onlineUserIds]);

  useEffect(() => {
    setGroupAnnouncementDismissedForId(null);
  }, [selected.id, selected.announcement, selected.announcementScroll]);

  useEffect(() => {
    messageStatusesRef.current = messageStatuses;
  }, [messageStatuses]);

  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  useEffect(() => {
    let cancelled = false;
    async function applyCallSystemPresence() {
      if (typeof navigator === "undefined") return;
      if (!activeCall) {
        if (callWakeLockRef.current) {
          try { await callWakeLockRef.current.release(); } catch { undefined; }
          callWakeLockRef.current = null;
        }
        if ("mediaSession" in navigator) {
          try { navigator.mediaSession.metadata = null; } catch { undefined; }
        }
        return;
      }
      if ("mediaSession" in navigator && typeof MediaMetadata !== "undefined") {
        try {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: activeCall.peerName,
            artist: activeCall.media === "video" ? "Glimpse video call" : "Glimpse voice call",
            album: activeCall.status === "active" ? "In call" : "Calling"
          });
          navigator.mediaSession.playbackState = "playing";
        } catch { undefined; }
      }
      const wakeLockNavigator = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } };
      if (!callWakeLockRef.current && wakeLockNavigator.wakeLock?.request) {
        try {
          const lock = await wakeLockNavigator.wakeLock.request("screen");
          if (cancelled || !activeCallRef.current) {
            try { await lock.release(); } catch { undefined; }
            return;
          }
          callWakeLockRef.current = lock;
        } catch { undefined; }
      }
    }
    void applyCallSystemPresence();
    return () => { cancelled = true; };
  }, [activeCall?.callId, activeCall?.media, activeCall?.peerName, activeCall?.status]);

  useEffect(() => {
    localCallStreamRef.current = localCallStream;
  }, [localCallStream]);
  useEffect(() => {
    cameraFacingRef.current = cameraFacing;
  }, [cameraFacing]);

  useEffect(() => {
    const shouldPlayTone = Boolean(incomingCall) || Boolean(activeCall && activeCall.status !== "active");
    if (!shouldPlayTone || typeof window === "undefined") return;
    let audioContext: AudioContext | null = null;
    let stopped = false;
    const playTone = () => {
      if (stopped) return;
      try {
        audioContext ??= new AudioContext();
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = incomingCall ? 880 : 520;
        gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.12, audioContext.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.22);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.24);
      } catch {
        // Browser may block notification audio until the page receives a user gesture.
      }
    };
    playTone();
    const timer = window.setInterval(playTone, incomingCall ? 1500 : 2200);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      void audioContext?.close().catch(() => undefined);
    };
  }, [incomingCall?.callId, activeCall?.callId, activeCall?.status]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("glimpse.uiLanguage", uiLanguage);
  }, [uiLanguage]);
  useEffect(() => {
    const stored = getStoredAuth();
    if (!stored) return;

    let cancelled = false;
    async function restoreSession(auth: AuthResponse) {
      try {
        const data = await apiJson<{ user: PublicUser }>("/auth/me", auth.accessToken);
        if (cancelled) return;
        const restored = { ...auth, user: { ...auth.user, ...data.user } };
        storeAuth(restored);
        setAccessToken(restored.accessToken);
        setCurrentUser(restored.user);
      } catch {
        clearStoredAuth();
        if (!cancelled) {
          setAccessToken("");
          setCurrentUser(null);
          setAuthError(appCopy[uiLanguage].sessionExpired);
        }
      }
    }

    void restoreSession(stored);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!accessToken || !currentUser) return;
    const socket = io(getSocketUrl(), {
      transports: ["websocket", "polling"],
      withCredentials: true,
      auth: { token: accessToken }
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
      setConnectionState("connected");
      const selectedConversationId = selectedIdRef.current;
      if (selectedConversationId && isConversationOpen(selectedConversationId)) socket.emit("conversation:join", { conversationId: selectedConversationId });
    });
    socket.on("disconnect", () => {
      setIsConnected(false);
      setConnectionState(navigator.onLine ? "reconnecting" : "offline");
    });
    socket.on("presence:state", (payload: { onlineUserIds?: string[] }) => {
      setOnlineUserIds(new Set(payload.onlineUserIds ?? []));
    });
    socket.on("presence:update", (payload: { userId?: string; online?: boolean }) => {
      if (!payload.userId) return;
      setOnlineUserIds((current) => {
        const next = new Set(current);
        if (payload.online) next.add(payload.userId!);
        else next.delete(payload.userId!);
        return next;
      });
    });
    socket.on("auth:error", (payload: { message?: string }) => {
      clearStoredAuth();
      setAccessToken("");
      setCurrentUser(null);
      setIsConnected(false);
      setConnectionState("offline");
      setAuthError(payload.message || t.sessionExpired);
      socket.disconnect();
    });
    socket.on("conversation:history", (payload: ConversationHistoryResponse) => {
      setMessagesByConversation((current) => ({
        ...current,
        [payload.conversationId]: mergeMessages(current[payload.conversationId] ?? [], payload.messages)
      }));
      setHistoryCursors((current) => ({ ...current, [payload.conversationId]: payload.nextCursor }));
      setHistoryEndReached((current) => ({ ...current, [payload.conversationId]: !payload.nextCursor }));
      setMessageLoadStates((current) => ({ ...current, [payload.conversationId]: "ready" }));
      setConversations((items) => items.map((item) => (item.id === payload.conversationId ? { ...item, unread: 0 } : item)));
      if (payload.conversationId === selectedIdRef.current && isConversationOpen(payload.conversationId)) requestScrollToBottom("auto");
      queueAutoTranslations(payload.messages, translationTargetLanguageRef.current);
    });
    socket.on("conversation:removed", (payload: { conversationId?: string }) => {
      if (!payload.conversationId) return;
      setConversations((items) => items.filter((item) => item.id !== payload.conversationId));
      setMessagesByConversation((current) => {
        const next = { ...current };
        delete next[payload.conversationId!];
        return next;
      });
      if (selectedIdRef.current === payload.conversationId) {
        setSelectedId("");
        setMobilePane("list");
        setGroupDetailsOpen(false);
        setGroupDetailsConversation(null);
      }
      setNotice(uiLabel(uiLanguage, { zh: "你已被移出该群聊。", en: "You were removed from this group.", hi: "आपको इस समूह से हटा दिया गया है।" }));
    });
    socket.on("group:member-removed", (payload: { conversationId?: string; userId?: string; memberCount?: number }) => {
      if (!payload.conversationId || !payload.userId) return;
      if (selectedIdRef.current === payload.conversationId) setGroupMembers((items) => items.filter((item) => item.user.id !== payload.userId));
      setConversations((items) => items.map((item) => item.id === payload.conversationId ? { ...item, memberCount: payload.memberCount ?? item.memberCount } : item));
    });
    socket.on("group:member-admin-changed", (payload: { conversationId?: string; userId?: string; isAdmin?: boolean }) => {
      if (!payload.conversationId || !payload.userId || typeof payload.isAdmin !== "boolean") return;
      if (selectedIdRef.current === payload.conversationId) setGroupMembers((items) => items.map((item) => item.user.id === payload.userId ? { ...item, isAdmin: payload.isAdmin! } : item));
    });
    socket.on("message:new", (message: MessagePayload) => {
      const translationEditNotice = message.type === "text" ? parseTranslationEditNotice(message.body) : null;
      const ownTranslationEditNotice = Boolean(translationEditNotice && message.senderId === currentUserIdRef.current);
      if (message.senderId === currentUserIdRef.current) {
        setMessageStatuses((current) => ({ ...current, [message.id]: mergeMessageStatus(current[message.id], "delivered") }));
      }
      setHiddenConversationIds((current) => current.has(message.conversationId) ? new Set(Array.from(current).filter((id) => id !== message.conversationId)) : current);
      setMessagesByConversation((current) => ({
        ...current,
        [message.conversationId]: mergeMessages(current[message.conversationId] ?? [], [message])
      }));
      const conversationOpen = isConversationOpen(message.conversationId);
      setConversations((items) =>
        items.map((item) =>
          item.id === message.conversationId
            ? {
                ...item,
                preview: mediaPreviewLabel(message) || item.preview,
                time: formatConversationTime(message.createdAt),
                latestMessageAt: message.createdAt,
                unread: message.senderId === currentUserIdRef.current || conversationOpen ? item.unread : item.unread + 1
              }
            : item
        )
      );
      if (conversationOpen && message.senderId !== currentUserIdRef.current) {
        void markConversationRead(message.conversationId);
      }
      if (!conversationOpen && message.senderId !== currentUserIdRef.current) {
        notifyIncomingMessage(message);
      }
      if (conversationOpen && !ownTranslationEditNotice) showLatestMessageAttention(message.id);
      if (ownTranslationEditNotice) restoreTranslationEditScrollPosition();
      queueAutoTranslation(message, translationTargetLanguageRef.current);
    });
    socket.on("message:translation-updated", (message: MessagePayload) => {
      setHiddenMessageIds((current) => {
        if (!current.has(message.id)) return current;
        const next = new Set(current);
        next.delete(message.id);
        return next;
      });
      setMessagesByConversation((current) => ({
        ...current,
        [message.conversationId]: mergeMessages(current[message.conversationId] ?? [], [message])
      }));
      queueAutoTranslation(message, translationTargetLanguageRef.current);
    });
    socket.on("typing", (payload: { conversationId?: string; userId?: string; name?: string }) => {
      if (!payload.conversationId || !payload.userId || payload.userId === currentUserIdRef.current) return;
      if (payload.conversationId !== selectedIdRef.current || !isConversationOpen(payload.conversationId)) return;
      const name = payload.name || "";
      if (!name) return;
      setTypingUserNames((current) => Array.from(new Set([...current, name])));
      const key = `${payload.conversationId}:${payload.userId}`;
      const existing = typingClearTimersRef.current[key];
      if (existing) window.clearTimeout(existing);
      typingClearTimersRef.current[key] = window.setTimeout(() => {
        setTypingUserNames((current) => current.filter((item) => item !== name));
        delete typingClearTimersRef.current[key];
      }, 3000);
    });
    socket.on("message:revoked", (message: MessagePayload) => {
      applyRevokedMessage(message);
    });
    socket.on("message:deleted", (payload: { conversationId?: string; messageIds?: string[] }) => {
      if (!payload.conversationId || !Array.isArray(payload.messageIds)) return;
      applyDeletedMessages(payload.conversationId, payload.messageIds);
    });
    socket.on("call:signal", (event: CallSignalEvent) => {
      void handleCallSignal(event);
    });

    socket.on("conversation:read", (payload: { conversationId?: string; userId?: string; readAt?: string }) => {
      if (!payload.conversationId || !payload.userId || !payload.readAt || payload.userId === currentUserIdRef.current) return;
      const readTime = new Date(payload.readAt).getTime();
      if (Number.isNaN(readTime)) return;
      const messages = messagesByConversationRef.current[payload.conversationId] ?? [];
      setMessageStatuses((current) => {
        let changed = false;
        const next = { ...current };
        for (const message of messages) {
          if (message.senderId !== currentUserIdRef.current) continue;
          if (new Date(message.createdAt).getTime() > readTime) continue;
          const merged = mergeMessageStatus(next[message.id], "read");
          if (merged !== next[message.id]) {
            next[message.id] = merged;
            changed = true;
          }
        }
        return changed ? next : current;
      });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [accessToken, currentUser]);

  useEffect(() => {
    if (!socketRef.current?.connected) return;
    for (const item of conversations) watchConversation(item.id);
  }, [conversations, isConnected]);
  useEffect(() => {
    if (socketRef.current?.connected && selectedExists && isConversationOpen(selectedId)) {
      socketRef.current.emit("conversation:join", { conversationId: selectedId });
    }
  }, [selectedId, selectedExists, mobilePane, isConnected]);

  useEffect(() => {
    if (!accessToken) return;

    function resumeRealtime() {
      if (document.visibilityState === "hidden") return;
      if (!navigator.onLine) {
        setConnectionState("offline");
        return;
      }
      const socket = socketRef.current;
      const selectedConversationId = selectedIdRef.current;
      if (socket && !socket.connected) {
        setConnectionState("reconnecting");
        socket.connect();
      } else if (socket?.connected) {
        setConnectionState("connected");
        setIsConnected(true);
      }
      if (socket?.connected && selectedConversationId && isConversationOpen(selectedConversationId)) joinConversation(selectedConversationId);
      void loadConversations(accessToken);
    }

    function markOffline() {
      setIsConnected(false);
      setConnectionState("offline");
    }

    document.addEventListener("visibilitychange", resumeRealtime);
    window.addEventListener("focus", resumeRealtime);
    window.addEventListener("online", resumeRealtime);
    window.addEventListener("offline", markOffline);
    return () => {
      document.removeEventListener("visibilitychange", resumeRealtime);
      window.removeEventListener("focus", resumeRealtime);
      window.removeEventListener("online", resumeRealtime);
      window.removeEventListener("offline", markOffline);
    };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    void loadConversations(accessToken);
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) {
      setTtsConfig({ provider: "loading", doubao: { voiceType: "", voices: [] }, aliyun: { voiceType: "", model: "", voices: [] } });
      return;
    }
    void loadTtsRuntimeConfig(accessToken);
  }, [accessToken]);

  useEffect(() => {
    let cancelled = false;
    void fetchWithTimeout(`${getApiUrl()}/system/slogans`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load slogans.");
        return await response.json() as { slogans?: AppSlogan[] };
      })
      .then((data) => {
        if (cancelled || !Array.isArray(data.slogans) || !data.slogans.length) return;
        setAppSlogans(data.slogans);
        setActiveSlogan(pickRandomSlogan(data.slogans));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);


  useEffect(() => {
    if (!accessToken || (tab !== 'contacts' && !groupModalOpen && !groupDetailsOpen)) return;
    void loadFriendData(accessToken);
  }, [accessToken, groupDetailsOpen, groupModalOpen, tab]);
  useEffect(() => {
    if (!accessToken || tab !== "contacts" || contactQuery.trim().length < 2) {
      setContactResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void searchUsers(contactQuery);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [accessToken, tab, contactQuery]);


  useEffect(() => {
    const keyword = globalQuery.trim();
    if (!accessToken || keyword.length < 2) {
      setServerGlobalSearchResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      apiJson<{ results: GlobalSearchResult[] }>(`/search/global?q=${encodeURIComponent(keyword)}`, accessToken)
        .then((data) => setServerGlobalSearchResults(data.results))
        .catch(() => setServerGlobalSearchResults([]));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [accessToken, globalQuery]);
  useEffect(() => {
    if (!accessToken || !selectedExists) return;
    queueAutoTranslations(currentMessages, translationTargetLanguage);
  }, [accessToken, selectedExists, currentMessages, translationTargetLanguage]);

  useEffect(() => {
    if (!pendingScrollToBottomRef.current) return;
    pendingScrollToBottomRef.current = false;
    const behavior = pendingScrollBehaviorRef.current;
    window.requestAnimationFrame(() => scrollMessagesToBottom(behavior));
  }, [currentMessages.length, selected.id]);
  async function loadConversations(token = accessToken) {
    if (!token) return;
    setConversationsLoading(true);
    setConversationsFailed(false);
    try {
      const data = await apiJson<{ conversations: ConversationSummary[] }>("/conversations", token);
      const mapped = data.conversations.map(mapConversation);
      setConversations(mapped);
      for (const item of mapped) watchConversation(item.id);
      setHistoryCursors((current) => Object.fromEntries(mapped.map((item) => [item.id, current[item.id]])));
      setHistoryEndReached((current) => Object.fromEntries(mapped.map((item) => [item.id, current[item.id] ?? false])));
      const first = mapped[0];
      const nextSelectedId = mapped.some((item) => item.id === selectedIdRef.current) ? selectedIdRef.current : first?.id;
      const selectedConversationChanged = Boolean(nextSelectedId && nextSelectedId !== selectedIdRef.current);
      if (nextSelectedId) selectedIdRef.current = nextSelectedId;
      if (nextSelectedId && selectedConversationChanged) setSelectedId(nextSelectedId);
      if (nextSelectedId) await loadConversationHistory(nextSelectedId, token, "auto");
    } catch (error) {
      setConversationsFailed(true);
      setNotice(extractErrorMessage(error, t.requestFailed));
    } finally {
      setConversationsLoading(false);
    }
  }

  async function loadConversationHistory(conversationId: string, token = accessToken, scrollBehavior: ScrollBehavior = "auto") {
    setMessageLoadStates((current) => ({ ...current, [conversationId]: "loading" }));
    try {
      const data = await apiJson<ConversationHistoryResponse>(`/conversations/${encodeURIComponent(conversationId)}/messages?limit=50`, token);
      setMessagesByConversation((current) => ({
        ...current,
        [data.conversationId]: mergeMessages(current[data.conversationId] ?? [], data.messages)
      }));
      setHistoryCursors((current) => ({ ...current, [data.conversationId]: data.nextCursor }));
      setHistoryEndReached((current) => ({ ...current, [data.conversationId]: !data.nextCursor }));
      setMessageLoadStates((current) => ({ ...current, [data.conversationId]: "ready" }));
      queueAutoTranslations(data.messages, translationTargetLanguageRef.current);
      if (data.conversationId === selectedIdRef.current && isConversationOpen(data.conversationId)) requestScrollToBottom(scrollBehavior);
    } catch (error) {
      setMessageLoadStates((current) => ({ ...current, [conversationId]: "failed" }));
      setNotice(extractErrorMessage(error, t.requestFailed));
    }
  }

  function watchConversation(conversationId: string) {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    socket.emit("conversation:watch", { conversationId });
  }

  function joinConversation(conversationId: string) {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    setMessageLoadStates((current) => ({ ...current, [conversationId]: "loading" }));
    socket.emit("conversation:join", { conversationId }, (response?: { ok?: boolean }) => {
      if (!response?.ok) setMessageLoadStates((current) => ({ ...current, [conversationId]: "failed" }));
    });
  }

  function emitCallSignal(payload: Omit<CallSignalPayload, "conversationId" | "callId" | "media"> & { conversationId?: string; callId?: string; media?: CallMediaKind; participantUserIds?: string[] }) {
    const call = activeCallRef.current;
    const conversationId = payload.conversationId ?? call?.conversationId;
    const callId = payload.callId ?? call?.callId;
    const media = payload.media ?? call?.media;
    const participantUserIds = payload.participantUserIds ?? call?.participantUserIds;
    const socket = socketRef.current;
    if (!socket?.connected || !conversationId || !callId || !media) return;
    socket.emit("call:signal", { ...payload, conversationId, callId, media, ...(participantUserIds?.length ? { participantUserIds } : {}) });
  }

  function stopLocalCallStream() {
    localCallStreamRef.current?.getTracks().forEach((track) => track.stop());
    localCallStreamRef.current = null;
    setLocalCallStream(null);
  }

  function closePeerConnections() {
    Object.values(peerConnectionsRef.current).forEach((peer) => peer.close());
    peerConnectionsRef.current = {};
    pendingIceCandidatesRef.current = {};
    setRemoteCallStreams([]);
  }

  function callMediaErrorMessage(error: unknown) {
    if (typeof window !== "undefined" && !window.isSecureContext) {
      return uiLabel(uiLanguage, { zh: "当前页面不是安全上下文，浏览器不允许访问麦克风或摄像头。请使用 localhost 或 HTTPS。", en: "This page is not a secure context, so the browser will not allow microphone/camera access. Use localhost or HTTPS.", hi: "यह पेज सुरक्षित संदर्भ में नहीं है, इसलिए ब्राउज़र माइक्रोफोन या कैमरे की अनुमति नहीं देगा। localhost या HTTPS का उपयोग करें।" });
    }
    if (error instanceof DOMException) {
      const device = (error as DOMException & { glimpseMediaDevice?: "camera" | "microphone" }).glimpseMediaDevice;
      const deviceZh = device === "camera" ? "摄像头" : device === "microphone" ? "麦克风" : "麦克风或摄像头";
      const deviceEn = device === "camera" ? "Camera" : device === "microphone" ? "Microphone" : "Microphone or camera";
      const deviceHi = device === "camera" ? "कैमरा" : device === "microphone" ? "माइक्रोफोन" : "माइक्रोफोन या कैमरा";
      if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") return uiLabel(uiLanguage, { zh: `${deviceZh}权限被拒绝，请在浏览器的网站权限和手机系统权限中允许后重试。`, en: `${deviceEn} permission was denied. Allow it in both browser site permissions and phone system permissions, then try again.`, hi: `${deviceHi} की अनुमति अस्वीकार की गई। ब्राउज़र साइट अनुमति और फोन सिस्टम अनुमति दोनों में इसे चालू करके फिर प्रयास करें।` });
      if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") return uiLabel(uiLanguage, { zh: `没有找到可用的${deviceZh}。`, en: `No available ${deviceEn.toLowerCase()} was found.`, hi: `कोई उपलब्ध ${deviceHi} नहीं मिला।` });
      if (error.name === "NotReadableError") return uiLabel(uiLanguage, { zh: `${deviceZh}正在被其他应用占用。`, en: `The ${deviceEn.toLowerCase()} is being used by another app.`, hi: `${deviceHi} किसी अन्य ऐप द्वारा उपयोग किया जा रहा है।` });
    }
    return error instanceof Error && error.message ? localizeNoticeMessage(error.message, uiLanguage) : callLabels[uiLanguage].permissionFailed;
  }

  async function ensureLocalCallStream(media: CallMediaKind) {
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
      throw new Error(callLabels[uiLanguage].notSupported);
    }
    const existing = localCallStreamRef.current;
    const hasAudio = existing?.getAudioTracks().some((track) => track.readyState === "live");
    const hasVideo = existing?.getVideoTracks().some((track) => track.readyState === "live");
    if (existing && hasAudio && (media === "audio" || hasVideo)) return existing;
    const tagDeviceError = (error: unknown, device: "camera" | "microphone") => {
      if (error instanceof DOMException) Object.assign(error, { glimpseMediaDevice: device });
      throw error;
    };
    let acquiredAudio: MediaStream | null = null;
    let acquiredVideo: MediaStream | null = null;
    const newlyAcquiredTracks: MediaStreamTrack[] = [];
    try {
      if (!hasVideo && media === "video") {
        try {
          acquiredVideo = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: cameraFacingRef.current } } });
          newlyAcquiredTracks.push(...acquiredVideo.getTracks());
        } catch (error) {
          const canRetryWithoutFacingMode = error instanceof DOMException && ["OverconstrainedError", "ConstraintNotSatisfiedError", "NotFoundError"].includes(error.name);
          if (!canRetryWithoutFacingMode) tagDeviceError(error, "camera");
          try { acquiredVideo = await navigator.mediaDevices.getUserMedia({ audio: false, video: true }); newlyAcquiredTracks.push(...acquiredVideo.getTracks()); }
          catch (fallbackError) { tagDeviceError(fallbackError, "camera"); }
        }
      }
      if (!hasAudio) {
        try { acquiredAudio = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }); newlyAcquiredTracks.push(...acquiredAudio.getTracks()); }
        catch (error) { tagDeviceError(error, "microphone"); }
      }
    } catch (error) {
      newlyAcquiredTracks.forEach((track) => track.stop());
      throw error;
    }
    const audioTracks = hasAudio ? existing!.getAudioTracks().filter((track) => track.readyState === "live") : acquiredAudio?.getAudioTracks() ?? [];
    const videoTracks = media === "video" ? (hasVideo ? existing!.getVideoTracks().filter((track) => track.readyState === "live") : acquiredVideo?.getVideoTracks() ?? []) : [];
    const stream = new MediaStream([...audioTracks, ...videoTracks]);
    if (!audioTracks.length) throw new Error(uiLabel(uiLanguage, { zh: "未能取得麦克风音轨。", en: "No microphone audio track was acquired.", hi: "माइक्रोफोन ऑडियो ट्रैक नहीं मिला।" }));
    if (media === "video" && !videoTracks.length) throw new Error(uiLabel(uiLanguage, { zh: "未能取得摄像头视频轨道。", en: "No camera video track was acquired.", hi: "कैमरा वीडियो ट्रैक नहीं मिला।" }));
    if (existing && existing !== stream) existing.getTracks().filter((track) => !stream.getTracks().includes(track)).forEach((track) => track.stop());
    localCallStreamRef.current = stream;
    setLocalCallStream(stream);
    return stream;
  }

  function callPeerKey(userId: string) {
    return userId || "unknown";
  }

  async function flushPendingIceCandidates(userId: string) {
    const peer = peerConnectionsRef.current[callPeerKey(userId)];
    const candidates = pendingIceCandidatesRef.current[callPeerKey(userId)] ?? [];
    if (!peer?.remoteDescription || candidates.length === 0) return;
    pendingIceCandidatesRef.current[callPeerKey(userId)] = [];
    for (const candidate of candidates) {
      try {
        await peer.addIceCandidate(candidate);
      } catch {
        // Ignore stale ICE candidates from a closed or replaced peer.
      }
    }
  }

  function createPeerConnection(remoteUserId: string, remoteName: string, call: ActiveCall) {
    const key = callPeerKey(remoteUserId);
    const existing = peerConnectionsRef.current[key];
    if (existing && existing.connectionState !== "closed") return existing;
    const peer = new RTCPeerConnection({ iceServers: [] });
    peerConnectionsRef.current[key] = peer;
    localCallStreamRef.current?.getTracks().forEach((track) => {
      const stream = localCallStreamRef.current;
      if (stream) peer.addTrack(track, stream);
    });
    peer.onicecandidate = (event) => {
      if (!event.candidate) return;
      emitCallSignal({ signalType: "ice-candidate", targetUserId: remoteUserId, candidate: event.candidate.toJSON(), conversationId: call.conversationId, callId: call.callId, media: call.media });
    };
    peer.ontrack = (event) => {
      const stream = event.streams[0];
      if (!stream) return;
      setRemoteCallStreams((items) => {
        const next = items.filter((item) => item.userId !== remoteUserId);
        return [...next, { userId: remoteUserId, name: remoteName || call.peerName, stream, media: call.media }];
      });
      setActiveCall((current) => current && current.callId === call.callId ? { ...current, status: "active" } : current);
    };
    peer.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(peer.connectionState)) {
        setRemoteCallStreams((items) => items.filter((item) => item.userId !== remoteUserId));
      }
    };
    return peer;
  }

  async function createOfferForPeer(remoteUserId: string, remoteName: string, call = activeCallRef.current) {
    if (!call || remoteUserId === currentUserIdRef.current) return;
    await ensureLocalCallStream(call.media);
    const peer = createPeerConnection(remoteUserId, remoteName, call);
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    emitCallSignal({ signalType: "offer", targetUserId: remoteUserId, sdp: offer.sdp, conversationId: call.conversationId, callId: call.callId, media: call.media });
  }

  async function answerOffer(event: IncomingCall | CallSignalEvent) {
    const call: ActiveCall = activeCallRef.current ?? {
      callId: event.callId,
      conversationId: event.conversationId,
      media: event.media,
      status: "connecting",
      direction: "incoming",
      peerName: event.fromName ?? selected.name,
      startedAt: Date.now(),
      muted: false,
      cameraOff: false,
      participantUserIds: event.participantUserIds
    };
    setActiveCall(call);
    activeCallRef.current = call;
    await ensureLocalCallStream(event.media);
    const peer = createPeerConnection(event.fromUserId, event.fromName ?? selected.name, call);
    if ("sdp" in event && event.sdp) {
      await peer.setRemoteDescription({ type: "offer", sdp: event.sdp });
      await flushPendingIceCandidates(event.fromUserId);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      emitCallSignal({ signalType: "answer", targetUserId: event.fromUserId, sdp: answer.sdp, conversationId: event.conversationId, callId: event.callId, media: event.media });
    }
  }

  async function startCall(media: CallMediaKind, participantUserIds: string[] = []) {
    if (activeCallRef.current) {
      const message = callLabels[uiLanguage].callBusy;
      setCallError(message);
      setNotice(message);
      return;
    }
    const currentUserId = currentUserIdRef.current;
    const callParticipantUserIds = selected.type === "group" && currentUserId
      ? Array.from(new Set([currentUserId, ...participantUserIds]))
      : undefined;
    const call: ActiveCall = {
      callId: createBrowserId(),
      conversationId: selected.id,
      media,
      status: "connecting",
      direction: "outgoing",
      peerName: selected.name,
      startedAt: Date.now(),
      muted: false,
      cameraOff: media === "audio",
      participantUserIds: callParticipantUserIds
    };
    activeCallRef.current = call;
    setActiveCall(call);
    setIncomingCall(null);
    setCallError("");
    try {
      const stream = await ensureLocalCallStream(media);
      const readyCall = {
        ...call,
        status: "ringing" as CallStatus,
        muted: stream.getAudioTracks().every((track) => !track.enabled),
        cameraOff: media === "video" ? stream.getVideoTracks().every((track) => !track.enabled) : true
      };
      activeCallRef.current = readyCall;
      setActiveCall(readyCall);
      emitCallSignal({ signalType: "join", conversationId: readyCall.conversationId, callId: readyCall.callId, media: readyCall.media, participantUserIds: readyCall.participantUserIds });
    } catch (error) {
      const message = callMediaErrorMessage(error);
      setCallError(message);
      setNotice(message);
      endActiveCall(false);
    }
  }

  async function acceptIncomingCall() {
    if (!incomingCall) return;
    try {
      setCallError("");
      const call: ActiveCall = {
        callId: incomingCall.callId,
        conversationId: incomingCall.conversationId,
        media: incomingCall.media,
        status: "connecting",
        direction: "incoming",
        peerName: incomingCall.fromName ?? selected.name,
        startedAt: Date.now(),
        muted: false,
        cameraOff: incomingCall.media === "audio",
        participantUserIds: incomingCall.participantUserIds
      };
      activeCallRef.current = call;
      setActiveCall(call);
      setIncomingCall(null);
      await ensureLocalCallStream(incomingCall.media);
      if (incomingCall.signalType === "offer" && incomingCall.sdp) {
        await answerOffer(incomingCall);
      }
      emitCallSignal({ signalType: "join", conversationId: call.conversationId, callId: call.callId, media: call.media });
    } catch (error) {
      const message = callMediaErrorMessage(error);
      setCallError(message);
      setNotice(message);
      endActiveCall(false);
    }
  }

  function rejectIncomingCall() {
    if (!incomingCall) return;
    emitCallSignal({ signalType: "reject", conversationId: incomingCall.conversationId, callId: incomingCall.callId, media: incomingCall.media, targetUserId: incomingCall.fromUserId });
    setIncomingCall(null);
  }

  function endActiveCall(notify = true) {
    const call = activeCallRef.current;
    if (notify && call) emitCallSignal({ signalType: "end", conversationId: call.conversationId, callId: call.callId, media: call.media });
    closePeerConnections();
    stopLocalCallStream();
    activeCallRef.current = null;
    setActiveCall(null);
    setRemoteCameraOffByUserId({});
    setCallExpanded(false);
    setFocusedCallTileId(null);
    setCallPipPosition({ x: 16, y: 88 });
    setCallPipSize({ width: 96, height: 171 });
    setIncomingCall(null);
  }

  async function handleCallSignal(event: CallSignalEvent) {
    if (event.fromUserId === currentUserIdRef.current) return;
    if (event.targetUserId && event.targetUserId !== currentUserIdRef.current) return;
    const currentUserId = currentUserIdRef.current;
    if (event.participantUserIds?.length && (!currentUserId || !event.participantUserIds.includes(currentUserId))) return;
    const current = activeCallRef.current;
    if (current && event.callId !== current.callId && ["join", "offer"].includes(event.signalType)) {
      emitCallSignal({ signalType: "busy", conversationId: event.conversationId, callId: event.callId, media: event.media, targetUserId: event.fromUserId });
      return;
    }
    if (event.signalType === "join") {
      if (!current) {
        setIncomingCall({ callId: event.callId, conversationId: event.conversationId, media: event.media, fromUserId: event.fromUserId, fromName: event.fromName, signalType: "join", participantUserIds: event.participantUserIds });
        return;
      }
      if (current.callId === event.callId) await createOfferForPeer(event.fromUserId, event.fromName ?? selected.name, current);
      return;
    }
    if (event.signalType === "offer") {
      if (!event.sdp) return;
      if (!current) {
        setIncomingCall({ callId: event.callId, conversationId: event.conversationId, media: event.media, fromUserId: event.fromUserId, fromName: event.fromName, signalType: "offer", sdp: event.sdp, participantUserIds: event.participantUserIds });
        return;
      }
      await answerOffer(event);
      return;
    }
    if (event.signalType === "answer") {
      const peer = peerConnectionsRef.current[callPeerKey(event.fromUserId)];
      if (peer && event.sdp) {
        await peer.setRemoteDescription({ type: "answer", sdp: event.sdp });
        await flushPendingIceCandidates(event.fromUserId);
        setActiveCall((call) => call && call.callId === event.callId ? { ...call, status: "active" } : call);
      }
      return;
    }
    if (event.signalType === "ice-candidate") {
      const candidate = event.candidate as RTCIceCandidateInit | undefined;
      if (!candidate) return;
      const key = callPeerKey(event.fromUserId);
      const peer = peerConnectionsRef.current[key];
      if (!peer?.remoteDescription) {
        pendingIceCandidatesRef.current[key] = [...(pendingIceCandidatesRef.current[key] ?? []), candidate];
        return;
      }
      try {
        await peer.addIceCandidate(candidate);
      } catch {
        // Ignore stale ICE candidates.
      }
      return;
    }
    if (event.signalType === "camera-state") {
      const cameraOff = Boolean(event.cameraOff);
      setRemoteCameraOffByUserId((items) => ({ ...items, [event.fromUserId]: cameraOff }));
      setRemoteCallStreams((items) => items.map((item) => item.userId === event.fromUserId ? { ...item, cameraOff } : item));
      return;
    }
    if (event.signalType === "reject") {
      setCallError(callLabels[uiLanguage].callRejected);
      if (selected.type === "single") endActiveCall(false);
      return;
    }
    if (event.signalType === "busy") {
      setCallError(callLabels[uiLanguage].callBusy);
      return;
    }
    if (event.signalType === "end") {
      setRemoteCallStreams((items) => items.filter((item) => item.userId !== event.fromUserId));
      const peer = peerConnectionsRef.current[callPeerKey(event.fromUserId)];
      peer?.close();
      delete peerConnectionsRef.current[callPeerKey(event.fromUserId)];
      if (selected.type === "single") endActiveCall(false);
    }
  }

  function toggleCallMute() {
    const call = activeCallRef.current;
    const stream = localCallStreamRef.current;
    if (!call || !stream) return;
    const muted = !call.muted;
    stream.getAudioTracks().forEach((track) => { track.enabled = !muted; });
    setActiveCall({ ...call, muted });
  }

  function toggleCallCamera() {
    const call = activeCallRef.current;
    const stream = localCallStreamRef.current;
    if (!call || !stream || call.media !== "video") return;
    const cameraOff = !call.cameraOff;
    stream.getVideoTracks().forEach((track) => { track.enabled = !cameraOff; });
    const nextCall = { ...call, cameraOff };
    activeCallRef.current = nextCall;
    setActiveCall(nextCall);
    emitCallSignal({ signalType: "camera-state", cameraOff });
  }



  async function switchCallCamera() {
    const call = activeCallRef.current;
    const stream = localCallStreamRef.current;
    if (!call || !stream || call.media !== "video") return;
    const nextFacing: CameraFacingMode = cameraFacingRef.current === "user" ? "environment" : "user";
    const getReplacementTrack = async (releaseCurrentFirst: boolean) => {
      const currentVideoTracks = stream.getVideoTracks();
      if (releaseCurrentFirst) {
        currentVideoTracks.forEach((track) => {
          stream.removeTrack(track);
          track.stop();
        });
        setLocalCallStream(new MediaStream(stream.getTracks()));
        await new Promise((resolve) => window.setTimeout(resolve, 250));
      }
      const nextStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: nextFacing } } });
      const nextVideoTrack = nextStream.getVideoTracks()[0];
      if (!nextVideoTrack) throw new Error(callLabels[uiLanguage].permissionFailed);
      return nextVideoTrack;
    };
    const applyReplacementTrack = async (nextVideoTrack: MediaStreamTrack) => {
      stream.getVideoTracks().forEach((track) => {
        stream.removeTrack(track);
        track.stop();
      });
      stream.addTrack(nextVideoTrack);
      for (const peer of Object.values(peerConnectionsRef.current)) {
        const sender = peer.getSenders().find((item) => item.track?.kind === "video");
        if (sender) await sender.replaceTrack(nextVideoTrack);
      }
      cameraFacingRef.current = nextFacing;
      setCameraFacing(nextFacing);
      const nextCall = { ...call, cameraOff: false };
      activeCallRef.current = nextCall;
      setActiveCall(nextCall);
      emitCallSignal({ signalType: "camera-state", cameraOff: false });
      setLocalCallStream(new MediaStream(stream.getTracks()));
    };
    try {
      try {
        await applyReplacementTrack(await getReplacementTrack(false));
      } catch (firstError) {
        const errorName = firstError instanceof DOMException ? firstError.name : "";
        const shouldRetryAfterRelease = ["NotReadableError", "AbortError", "TrackStartError"].includes(errorName);
        if (!shouldRetryAfterRelease) throw firstError;
        await applyReplacementTrack(await getReplacementTrack(true));
      }
    } catch (error) {
      const message = callMediaErrorMessage(error);
      setCallError(message);
      setNotice(message);
    }
  }

  async function loadFriendData(token = accessToken) {
    if (!token) return;
    setFriendDataLoading(true);
    try {
      setFriendDataError("");
      const friendsData = await apiJson<{ friends: SearchUser[] }>("/contacts/friends", token);
      setFriendRequests([]);
      setFriends(friendsData.friends.map((friend) => ({ ...friend, online: onlineUserIds.has(friend.id) })));
    } catch (error) {
      const message = extractErrorMessage(error, t.friendRequestFailed);
      setFriendDataError(message);
      if (groupModalOpen || groupDetailsOpen) setGroupError(message);
      setNotice(message);
    } finally {
      setFriendDataLoading(false);
    }
  }
  async function saveContact(user: SearchUser) {
    try {
      const data = await apiJson<{ friend: SearchUser }>("/contacts/friends", accessToken, {
        method: "POST",
        body: JSON.stringify({ userId: user.id })
      });
      const saved = { ...data.friend, avatarUrl: normalizeMediaUrl(data.friend.avatarUrl ?? undefined), online: onlineUserIds.has(data.friend.id) };
      setHiddenContactUserIds((current) => {
        const next = new Set(current);
        next.delete(saved.id);
        return next;
      });
      setFriends((items) => items.some((item) => item.id === saved.id) ? items.map((item) => item.id === saved.id ? saved : item) : [saved, ...items]);
      setContactResults((items) => items.map((item) => item.id === saved.id ? { ...item, online: saved.online } : item));
      setNotice(t.contactSaved);
      await loadFriendData();
    } catch (error) {
      setNotice(extractErrorMessage(error, t.friendRequestFailed));
    }
  }



  async function blockUser(user: SearchUser) {
    try {
      const data = await apiJson<{ block: BlockedUserView }>("/contacts/blocks", accessToken, {
        method: "POST",
        body: JSON.stringify({ userId: user.id })
      });
      const normalizedBlock = { ...data.block, user: { ...data.block.user, avatarUrl: normalizeMediaUrl(data.block.user.avatarUrl ?? undefined) } };
      setBlockedUsers((items) => items.some((item) => item.user.id === user.id) ? items : [normalizedBlock, ...items]);
      setContactResults((items) => items.filter((item) => item.id !== user.id));
      setNotice(t.userBlocked);
      void loadFriendData();
    } catch (error) {
      setNotice(extractErrorMessage(error, t.friendRequestFailed));
    }
  }

  async function unblockUser(user: SearchUser) {
    try {
      await apiJson<{ ok: true }>(`/contacts/blocks/${encodeURIComponent(user.id)}`, accessToken, { method: "DELETE" });
      setBlockedUsers((items) => items.filter((block) => block.user.id !== user.id));
      setNotice(t.userUnblocked);
      void loadFriendData();
    } catch (error) {
      setNotice(extractErrorMessage(error, t.friendRequestFailed));
    }
  }
  async function removeFriend(friend: SearchUser, clearChatHistory = false) {
    setHiddenContactUserIds((current) => new Set(current).add(friend.id));
    setFriends((items) => items.filter((item) => item.id !== friend.id));
    if (clearChatHistory) {
      const conversation = conversationsRef.current.find((item) => item.type === "single" && item.otherUser?.id === friend.id);
      if (conversation) {
        setHiddenConversationIds((current) => new Set(current).add(conversation.id));
        setMessagesByConversation((current) => {
          const { [conversation.id]: _removed, ...rest } = current;
          return rest;
        });
        if (selectedIdRef.current === conversation.id) {
          const next = conversationsRef.current.find((item) => item.id !== conversation.id && !hiddenConversationIds.has(item.id));
          setSelectedId(next?.id ?? defaultConversation.id);
        }
      }
    }
    setContactDetailsUser(null);
    setRemoveContactClearHistory(false);
    setNotice(t.friendRemoved);
    try {
      await apiJson<{ ok: true }>(`/contacts/friends/${encodeURIComponent(friend.id)}`, accessToken, { method: "DELETE" });
    } catch {
      // Mutual-message contacts may not have a legacy friendRequest row. Keep local removal and chat history.
    }
  }
  async function respondFriendRequest(requestId: string, accepted: boolean) {
    try {
      await apiJson<{ request: FriendRequestView }>(`/contacts/friend-requests/${encodeURIComponent(requestId)}/${accepted ? "accept" : "reject"}`, accessToken, { method: "POST" });
      setNotice(accepted ? t.friendRequestAccepted : t.friendRequestRejected);
      await loadFriendData();
      if (accepted) await loadConversations();
    } catch (error) {
      setNotice(extractErrorMessage(error, t.friendRequestFailed));
    }
  }
  async function searchUsers(keyword: string) {
    setContactsLoading(true);
    try {
      const data = await apiJson<{ users: SearchUser[] }>(`/contacts/search?q=${encodeURIComponent(keyword)}`, accessToken);
      setContactResults(data.users.map((user) => ({ ...user, online: onlineUserIds.has(user.id) })));
    } catch (error) {
      setNotice(extractErrorMessage(error, t.searchFailed));
    } finally {
      setContactsLoading(false);
    }
  }

  function openGlobalSearchResult(result: GlobalSearchResult) {
    setGlobalQuery("");
    if (result.kind === "contact" && result.user) {
      setContactDetailsUser(result.user);
      setTab("contacts");
      setMobilePane("list");
      return;
    }
    if (result.favorite) {
      openFavoriteMessage(result.favorite);
      return;
    }
    if (result.conversationId) {
      if (result.message) {
        setMessagesByConversation((current) => ({
          ...current,
          [result.message!.conversationId]: mergeMessages(current[result.message!.conversationId] ?? [], [result.message!])
        }));
      }
      setSelectedId(result.conversationId);
      setWelcomeDismissed(true);
      setTab("chats");
      setMobilePane("chat");
      if (result.messageId) window.setTimeout(() => void jumpToMessage(result.messageId!), 180);
      else requestScrollToBottom("auto");
    }
  }
  async function startDirectConversation(user: SearchUser) {
    try {
      const data = await apiJson<{ conversation: ConversationSummary }>("/conversations/direct", accessToken, {
        method: "POST",
        body: JSON.stringify({ userId: user.id })
      });
      const mapped = mapConversation(data.conversation);
      setConversations((items) => [mapped, ...items.filter((item) => item.id !== mapped.id)]);
      setSelectedId(mapped.id);
      setWelcomeDismissed(true);
      setTab("chats");
      setMobilePane("chat");
      requestScrollToBottom("auto");
      joinConversation(mapped.id);
      return mapped;
    } catch (error) {
      setNotice(extractErrorMessage(error, t.startConversationFailed));
      return null;
    }
  }

  async function startContactCall(user: SearchUser, media: CallMediaKind) {
    const conversation = await startDirectConversation(user);
    if (!conversation) return;
    setContactDetailsUser(null);
    setPendingContactCall({ conversationId: conversation.id, media });
  }


  function toggleGroupMember(userId: string) {
    setGroupError("");
    setGroupSelectedIds((current) => current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]);
  }

  async function createGroupConversation() {
    if (groupCreating) return;
    setGroupError("");
    if (groupSelectedIds.length < 2) {
      setGroupError(t.groupNeedTwoFriends);
      return;
    }
    setGroupCreating(true);
    try {
      const fallbackTitle = groupSelectedIds
        .map((id) => groupCandidateUsers.find((friend) => friend.id === id)?.nickname)
        .filter(Boolean)
        .slice(0, 3)
        .join(", ");
      const data = await apiJson<{ conversation: ConversationSummary }>("/conversations/group", accessToken, {
        method: "POST",
        body: JSON.stringify({ title: groupTitleValue.trim() || fallbackTitle || t.createGroup, userIds: groupSelectedIds })
      });
      const mapped = mapConversation(data.conversation);
      setConversations((items) => [mapped, ...items.filter((item) => item.id !== mapped.id)]);
      setSelectedId(mapped.id);
      setWelcomeDismissed(true);
      setTab("chats");
      setMobilePane("chat");
      setGroupModalOpen(false);
      setGroupTitleValue("");
      setGroupSelectedIds([]);
      setGroupError("");
      setNotice(t.groupCreated);
      requestScrollToBottom("auto");
      joinConversation(mapped.id);
    } catch (error) {
      const message = extractErrorMessage(error, t.groupCreateFailed);
      setGroupError(message);
      setNotice(message);
    } finally {
      setGroupCreating(false);
    }
  }

  async function startSelfConversation() {
    if (!currentUser) return;
    await startDirectConversation({
      ...currentUser,
      avatarUrl: profileAvatarPreviewUrl || profileAvatarUrl || currentUser.avatarUrl,
      online: true
    });
  }
  function selectConversation(id: string) {
    setSelectedId(id);
    setWelcomeDismissed(true);
    setTab("chats");
    setMobilePane("chat");
    setNotice("");
    setConversations((items) => items.map((item) => (item.id === id ? { ...item, unread: 0 } : item)));
    requestScrollToBottom("auto");
    void markConversationRead(id);
    joinConversation(id);
  }

  function jumpToLatestUnreadOrBottom() {
    const unreadConversation = filtered.find((item) => item.unread > 0 && !hiddenConversationIds.has(item.id));
    if (unreadConversation) {
      selectConversation(unreadConversation.id);
      window.setTimeout(() => scrollMessagesToBottom("smooth"), 120);
      return;
    }
    scrollMessagesToBottom("smooth");
    window.setTimeout(() => scrollMessagesToBottom("smooth"), 80);
  }

  function openWelcomePage() {
    setWelcomeOpen(true);
    setWelcomeDismissed(false);
    setMobilePane("chat");
  }

  function handleTitleClick() {
    openWelcomePage();
  }

  async function markConversationRead(conversationId: string) {
    if (!accessToken) return;
    const socket = socketRef.current;
    if (socket?.connected) {
      socket.emit("conversation:read", { conversationId }, (response?: { ok?: boolean }) => {
        if (!response?.ok) setNotice(t.readStateFailed);
      });
      return;
    }
    try {
      await apiJson<{ ok: true; readAt: string }>(`/conversations/${encodeURIComponent(conversationId)}/read`, accessToken, { method: "POST" });
    } catch (error) {
      setNotice(extractErrorMessage(error, t.readStateFailed));
    }
  }

  async function loadOlderMessages() {
    const oldestMessage = currentMessages[0];
    const before = oldestMessage
      ? `${oldestMessage.createdAt}|${oldestMessage.id}`
      : historyCursors[selected.id];
    if (!accessToken || !before || historyLoading) return;
    setHistoryLoading(true);
    try {
      const data = await apiJson<ConversationHistoryResponse>(`/conversations/${encodeURIComponent(selected.id)}/messages?before=${encodeURIComponent(before)}&limit=50`, accessToken);
      setMessagesByConversation((current) => ({
        ...current,
        [data.conversationId]: mergeMessages(current[data.conversationId] ?? [], data.messages)
      }));
      setHistoryCursors((current) => ({ ...current, [data.conversationId]: data.nextCursor }));
      setHistoryEndReached((current) => ({ ...current, [data.conversationId]: !data.nextCursor }));
      queueAutoTranslations(data.messages, translationTargetLanguageRef.current);
    } catch (error) {
      setNotice(extractErrorMessage(error, t.olderMessagesFailed));
    } finally {
      setHistoryLoading(false);
    }
  }

  function focusMessageById(messageId: string) {
    if (typeof document === "undefined") return false;
    const element = document.getElementById(`message-media-${messageId}`) ?? document.getElementById(`message-${messageId}`);
    if (!element) return false;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedMessageIds((current) => ({ ...current, [messageId]: true }));
    window.setTimeout(() => {
      setHighlightedMessageIds((current) => {
        const { [messageId]: _ignored, ...rest } = current;
        return rest;
      });
    }, 2200);
    return true;
  }

  async function jumpToMessage(messageId?: string) {
    if (!messageId) return;
    if (focusMessageById(messageId)) return;
    if (!historyCursors[selected.id]) {
      setNotice(t.noMoreMessages);
      return;
    }
    pendingQuoteJumpRef.current = messageId;
    await loadOlderMessages();
    window.setTimeout(() => {
      if (pendingQuoteJumpRef.current === messageId && !focusMessageById(messageId)) setNotice(t.loadOlder);
      if (pendingQuoteJumpRef.current === messageId) pendingQuoteJumpRef.current = null;
    }, 250);
  }

  async function jumpToQuotedMessage(messageId?: string) {
    await jumpToMessage(messageId);
  }

  function clearConversationLongPressTimer() {
    if (conversationLongPressTimerRef.current) {
      window.clearTimeout(conversationLongPressTimerRef.current);
      conversationLongPressTimerRef.current = null;
    }
  }

  function openConversationMenu(conversationId: string, x: number, y: number) {
    const left = Math.max(12, Math.min(x, window.innerWidth - 190));
    const top = Math.max(12, Math.min(y, window.innerHeight - 120));
    setConversationMenu({ conversationId, x: left, y: top });
  }

  function handleConversationContextMenu(event: React.MouseEvent<HTMLButtonElement>, conversationId: string) {
    event.preventDefault();
    openConversationMenu(conversationId, event.clientX, event.clientY);
  }

  function handleConversationPointerDown(event: ReactPointerEvent<HTMLButtonElement>, conversationId: string) {
    if (event.pointerType === "mouse") return;
    clearConversationLongPressTimer();
    conversationLongPressTriggeredRef.current = false;
    const x = event.clientX;
    const y = event.clientY;
    conversationLongPressTimerRef.current = window.setTimeout(() => {
      conversationLongPressTimerRef.current = null;
      conversationLongPressTriggeredRef.current = true;
      openConversationMenu(conversationId, x, y);
    }, 620);
  }

  function clearVideoPreviewLongPressTimer() {
    if (videoPreviewLongPressTimerRef.current) {
      window.clearTimeout(videoPreviewLongPressTimerRef.current);
      videoPreviewLongPressTimerRef.current = null;
    }
  }

  function openVideoPreview(url: string, name?: string, muted = false) {
    setPreviewMedia({ url, type: "video", name, muted });
  }

  function previewCanZoom() {
    return previewMedia?.type === "image" || previewMedia?.type === "avatar";
  }

  function setPreviewZoomOrigin(element: HTMLImageElement, clientX: number, clientY: number, nextZoom = previewZoom) {
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    // getBoundingClientRect() is the bounding box after rotation. Using it
    // directly makes a 90/270 degree image map the mouse to the wrong local
    // point (the width and height have swapped). Reconstruct the untransformed
    // box and invert the current rotate + scale matrix before solving the new
    // transform origin. Solving the next origin is important when the image
    // is already zoomed: simply assigning the local pointer position as the
    // origin would move the image as soon as the existing scale is changed.
    const computed = window.getComputedStyle(element);
    const width = element.offsetWidth || Number.parseFloat(computed.width) || rect.width;
    const height = element.offsetHeight || Number.parseFloat(computed.height) || rect.height;
    const originParts = computed.transformOrigin.split(/\s+/);
    const readOrigin = (value: string | undefined, size: number) => {
      if (!value) return size / 2;
      if (value.endsWith("%")) return (Number.parseFloat(value) / 100) * size;
      return Number.parseFloat(value);
    };
    const originX = Number.isFinite(readOrigin(originParts[0], width)) ? readOrigin(originParts[0], width) : width / 2;
    const originY = Number.isFinite(readOrigin(originParts[1], height)) ? readOrigin(originParts[1], height) : height / 2;
    const scale = Math.max(0.0001, previewZoom);
    const radians = (previewRotation * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const transformPoint = (x: number, y: number) => {
      const dx = x - originX;
      const dy = y - originY;
      return {
        x: originX + scale * (cos * dx - sin * dy),
        y: originY + scale * (sin * dx + cos * dy)
      };
    };
    const corners = [transformPoint(0, 0), transformPoint(width, 0), transformPoint(0, height), transformPoint(width, height)];
    const minX = Math.min(...corners.map((point) => point.x));
    const minY = Math.min(...corners.map((point) => point.y));
    const layoutLeft = rect.left - minX;
    const layoutTop = rect.top - minY;
    const transformedX = clientX - layoutLeft;
    const transformedY = clientY - layoutTop;
    const dx = (transformedX - originX) / scale;
    const dy = (transformedY - originY) / scale;
    const localX = originX + cos * dx + sin * dy;
    const localY = originY - sin * dx + cos * dy;
    const targetScale = Math.max(0.0001, nextZoom);
    const targetA = targetScale * cos;
    const targetB = -targetScale * sin;
    const targetC = targetScale * sin;
    const targetD = targetScale * cos;
    const matrix11 = 1 - targetA;
    const matrix12 = -targetB;
    const matrix21 = -targetC;
    const matrix22 = 1 - targetD;
    const determinant = matrix11 * matrix22 - matrix12 * matrix21;
    let targetOriginX = originX;
    let targetOriginY = originY;
    if (Math.abs(determinant) > 0.000001 && Number.isFinite(localX) && Number.isFinite(localY)) {
      const rightSideX = transformedX - (targetA * localX + targetB * localY);
      const rightSideY = transformedY - (targetC * localX + targetD * localY);
      targetOriginX = (rightSideX * matrix22 - matrix12 * rightSideY) / determinant;
      targetOriginY = (matrix11 * rightSideY - matrix21 * rightSideX) / determinant;
    }
    if (Number.isFinite(targetOriginX) && Number.isFinite(targetOriginY)) {
      const x = clampNumber((targetOriginX / width) * 100, -1000, 1000);
      const y = clampNumber((targetOriginY / height) * 100, -1000, 1000);
      setPreviewTransformOrigin(`${x}% ${y}%`);
    }
  }

  function handlePreviewImageWheel(event: ReactWheelEvent<HTMLImageElement>) {
    if (!previewCanZoom()) return;
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * 0.0015);
    const nextZoom = clampNumber(Number((previewZoom * factor).toFixed(3)), 0.5, 6);
    setPreviewZoomOrigin(event.currentTarget, event.clientX, event.clientY, nextZoom);
    setPreviewZoom(nextZoom);
  }

  function previewPointerDistance(points: ScreenshotPoint[]) {
    if (points.length < 2) return 0;
    const first = points[0];
    const second = points[1];
    if (!first || !second) return 0;
    return Math.hypot(first.x - second.x, first.y - second.y);
  }

  function handlePreviewImagePointerDown(event: ReactPointerEvent<HTMLImageElement>) {
    if (!previewCanZoom() || event.pointerType !== "touch") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    previewPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = Array.from(previewPointersRef.current.values()).slice(0, 2);
    const first = points[0];
    const second = points[1];
    if (points.length === 2 && first && second) {
      const distance = previewPointerDistance(points);
      previewPinchRef.current = { distance, zoom: previewZoom };
      event.preventDefault();
    }
  }

  function handlePreviewImagePointerMove(event: ReactPointerEvent<HTMLImageElement>) {
    if (!previewCanZoom() || event.pointerType !== "touch" || !previewPointersRef.current.has(event.pointerId)) return;
    previewPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = Array.from(previewPointersRef.current.values()).slice(0, 2);
    const pinch = previewPinchRef.current;
    if (points.length < 2 || !pinch || pinch.distance <= 0) return;
    event.preventDefault();
    const distance = previewPointerDistance(points);
    const nextZoom = clampNumber(Number((pinch.zoom * distance / pinch.distance).toFixed(3)), 0.5, 6);
    const first = points[0];
    const second = points[1];
    if (first && second) {
      setPreviewZoomOrigin(event.currentTarget, (first.x + second.x) / 2, (first.y + second.y) / 2, nextZoom);
    }
    setPreviewZoom(nextZoom);
  }

  function handlePreviewImagePointerEnd(event: ReactPointerEvent<HTMLImageElement>) {
    previewPointersRef.current.delete(event.pointerId);
    if (previewPointersRef.current.size < 2) previewPinchRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  async function openImageEditorFromPreview() {
    const media = previewMedia;
    if (!media || (media.type !== "image" && media.type !== "avatar")) return;
    try {
      const image = new Image();
      image.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Could not load this image for editing."));
        image.src = media.url;
      });
      if (!image.naturalWidth || !image.naturalHeight) throw new Error("Could not load this image for editing.");
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not prepare the image editor.");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      setPreviewMedia(null);
      setGalleryActionItem(null);
      setScreenshotSource(canvas.toDataURL("image/png"));
      setScreenshotSourceSize({ width: canvas.width, height: canvas.height });
      setScreenshotSelection({ x: 0, y: 0, width: canvas.width, height: canvas.height });
      setScreenshotAnnotations([]);
      setScreenshotTextPoint(null);
      setScreenshotTextDraft("");
      setScreenshotTextEditingId(null);
      setScreenshotSelectedAnnotationId(null);
      setScreenshotRotation(0);
      setScreenshotRotationBusy(false);
      setScreenshotUndoStack([]);
      setScreenshotRedoStack([]);
      clearScreenshotOcrResults();
      screenshotHistoryGestureRef.current = null;
      setScreenshotTool("select");
      setScreenshotEditorOpen(true);
    } catch (error) {
      setNotice(extractErrorMessage(error, uiLabel(uiLanguage, { zh: "无法打开图片编辑器", en: "Could not open the image editor.", hi: "इमेज एडिटर नहीं खुल सका।" })));
    }
  }

  function openMediaGallery(items: MessagePayload[], index: number) {
    const gallery = items.filter((item) => isAlbumMediaMessage(item));
    if (!gallery.length) return;
    const galleryIndex = Math.max(0, Math.min(index, gallery.length - 1));
    const item = gallery[galleryIndex];
    if (!item) return;
    const type = item.type === "video" ? "video" : "image";
    setPreviewRotation(0);
    setPreviewZoom(1);
    setPreviewVideoFit("auto");
    setPreviewVideoSize(null);
    setGalleryActionItem(null);
    setPreviewMedia({ url: mediaPreviewUrl(item), type, name: item.body, ...(type === "video" ? { muted: false } : {}), gallery, galleryIndex });
  }

  function openGalleryItemZoom(item: MessagePayload) {
    const type = item.type === "video" ? "video" : "image";
    setGalleryActionItem(null);
    setPreviewRotation(0);
    setPreviewZoom(1);
    setPreviewVideoFit("auto");
    setPreviewVideoSize(null);
    setPreviewMedia({ url: mediaPreviewUrl(item), type, name: item.body, ...(type === "video" ? { muted: false } : {}) });
  }

  function handleGalleryItemClick(event: React.MouseEvent<HTMLDivElement>, item: MessagePayload) {
    event.stopPropagation();
    if (galleryLongPressTriggeredRef.current) {
      galleryLongPressTriggeredRef.current = false;
      return;
    }
    openGalleryItemZoom(item);
  }

  function clearGalleryLongPressTimer() {
    if (galleryLongPressTimerRef.current) {
      window.clearTimeout(galleryLongPressTimerRef.current);
      galleryLongPressTimerRef.current = null;
    }
    galleryLongPressStartRef.current = null;
  }

  function handleMediaGalleryScroll(event: ReactUIEvent<HTMLDivElement>) {
    const gallery = previewMedia?.gallery;
    if (!gallery?.length) return;
    const container = event.currentTarget;
    if (!container.clientHeight) return;
    const containerRect = container.getBoundingClientRect();
    const viewportCenter = containerRect.top + container.clientHeight / 2;
    let nextIndex = previewMedia?.galleryIndex ?? 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    Array.from(container.children).forEach((child, index) => {
      const rect = child.getBoundingClientRect();
      const distance = Math.abs(rect.top + rect.height / 2 - viewportCenter);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nextIndex = index;
      }
    });
    if (nextIndex === (previewMedia?.galleryIndex ?? 0)) return;
    setGalleryActionItem(null);
    setPreviewMedia((current) => current?.gallery ? { ...current, galleryIndex: nextIndex } : current);
  }

  function handleGalleryItemPointerDown(event: ReactPointerEvent<HTMLDivElement>, item: MessagePayload) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    clearGalleryLongPressTimer();
    galleryLongPressTriggeredRef.current = false;
    galleryLongPressStartRef.current = { x: event.clientX, y: event.clientY };
    galleryLongPressTimerRef.current = window.setTimeout(() => {
      galleryLongPressTimerRef.current = null;
      galleryLongPressStartRef.current = null;
      galleryLongPressTriggeredRef.current = true;
      setGalleryActionItem(item);
    }, 620);
  }

  function handleGalleryItemPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const start = galleryLongPressStartRef.current;
    if (!start) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 14) {
      galleryLongPressTriggeredRef.current = true;
      clearGalleryLongPressTimer();
    }
  }

  function handleGalleryItemContextMenu(event: React.MouseEvent<HTMLDivElement>, item: MessagePayload) {
    event.preventDefault();
    clearGalleryLongPressTimer();
    galleryLongPressTriggeredRef.current = true;
    setGalleryActionItem(item);
  }

  function handleVideoPreviewPointerDown(event: ReactPointerEvent<HTMLButtonElement>, url: string, name?: string) {
    if (event.pointerType === "mouse") return;
    clearVideoPreviewLongPressTimer();
    videoPreviewLongPressTriggeredRef.current = false;
    videoPreviewLongPressTimerRef.current = window.setTimeout(() => {
      videoPreviewLongPressTimerRef.current = null;
      videoPreviewLongPressTriggeredRef.current = true;
      openVideoPreview(url, name, true);
    }, 620);
  }

  function handleVideoPreviewClick(url: string, name?: string) {
    if (videoPreviewLongPressTriggeredRef.current) {
      videoPreviewLongPressTriggeredRef.current = false;
      return;
    }
    openVideoPreview(url, name, false);
  }

  async function openArchivePreview(message: MessagePayload) {
    const path = archivePreviewPath(message);
    if (!path || !accessToken) return;
    setArchivePreview({ fileName: message.body || "Archive", totalEntries: 0, entries: [], truncated: false, loading: true });
    try {
      const data = await apiJson<ArchivePreviewResponse>(path, accessToken);
      setArchivePreview(data);
    } catch (error) {
      setArchivePreview({ fileName: message.body || "Archive", totalEntries: 0, entries: [], truncated: false, error: extractErrorMessage(error, t.requestFailed) });
    }
  }

  function toggleConversationPin(conversationId: string) {
    setPinnedConversationIds((current) => {
      const next = new Set(current);
      if (next.has(conversationId)) {
        next.delete(conversationId);
        setNotice(t.chatUnpinned);
      } else {
        next.add(conversationId);
        setNotice(t.chatPinned);
      }
      return next;
    });
    setConversationMenu(null);
  }

  function deleteConversationFromList(conversationId: string) {
    setHiddenConversationIds((current) => new Set(current).add(conversationId));
    setPinnedConversationIds((current) => {
      if (!current.has(conversationId)) return current;
      const next = new Set(current);
      next.delete(conversationId);
      return next;
    });
    setConversationMenu(null);
    setNotice(t.chatDeleted);
    if (selected.id === conversationId) {
      const next = conversations.find((item) => item.id !== conversationId && !hiddenConversationIds.has(item.id));
      if (next) selectConversation(next.id);
      else setMobilePane("list");
    }
  }
  function locateMediaMessage(messageId: string, conversationId = selected.id) {
    const switchingConversation = Boolean(conversationId && conversationId !== selected.id);
    if (switchingConversation) {
      setSelectedId(conversationId);
      setMobilePane("chat");
    }
    setMediaLibraryOpen(false);
    window.setTimeout(() => {
      void jumpToMessage(messageId);
    }, switchingConversation ? 180 : 80);
  }

  useEffect(() => {
    const messageId = pendingQuoteJumpRef.current;
    if (messageId && focusMessageById(messageId)) pendingQuoteJumpRef.current = null;
  }, [currentMessages]);

  function emitMessage(message: MessagePayload) {
    if (socketRef.current?.connected) {
      setMessageStatuses((current) => ({ ...current, [message.id]: "sending" }));
      let settled = false;
      const timeout = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        setMessageStatuses((current) => ({ ...current, [message.id]: "failed" }));
      }, 8000);

      socketRef.current.emit("message:send", message, (response?: { ok?: boolean; messageId?: string; error?: string }) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        if (response?.ok && response.messageId) {
          const confirmedMessage: MessagePayload = { ...message, id: response.messageId, createdAt: message.createdAt };
          setMessagesByConversation((current) => ({
            ...current,
            [message.conversationId]: mergeMessages((current[message.conversationId] ?? []).filter((item) => item.id !== message.id), [confirmedMessage])
          }));
          setMessageStatuses((current) => {
            const { [message.id]: _localStatus, ...rest } = current;
            return { ...rest, [confirmedMessage.id]: mergeMessageStatus(current[message.id], "sent") };
          });
          showLatestMessageAttention(confirmedMessage.id);
          queueAutoTranslation(confirmedMessage, translationTargetLanguageRef.current);
          setNotice(t.sent);
          return;
        }
        setMessageStatuses((current) => ({ ...current, [message.id]: response?.ok ? mergeMessageStatus(current[message.id], "sent") : "failed" }));
        if (response?.ok) setNotice(t.sent);
      });
      return;
    }
    setMessageStatuses((current) => ({ ...current, [message.id]: "failed" }));
    setNotice(t.disconnected);
  }

  function retryMessage(message: MessagePayload) {
    setNotice("");
    emitMessage(message);
  }

  function updateNotificationsEnabled(enabled: boolean) {
    setNotificationsEnabled(enabled);
    if (enabled) requestBrowserNotificationPermission();
  }

  function requestBrowserNotificationPermission() {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (window.Notification.permission === "default") void window.Notification.requestPermission();
  }

  function notifyIncomingMessage(message: MessagePayload) {
    if (!notificationsEnabledRef.current) return;
    const conversation = conversationsRef.current.find((item) => item.id === message.conversationId);
    const title = conversation?.name || message.senderName || "Glimpse Chat";
    const body = message.body?.trim() || "New message";

    if (notificationSoundEnabledRef.current) playNotificationSound();
    if (notificationVibrationEnabledRef.current && typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate([120, 60, 120]);
    }

    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotice(`${title}: ${body}`);
      return;
    }

    if (window.Notification.permission === "granted") {
      const notification = new window.Notification(title, {
        body,
        tag: `glimpse-${message.conversationId}`,
      });
      notification.onclick = () => {
        window.focus();
        selectConversation(message.conversationId);
        notification.close();
      };
      return;
    }

    if (window.Notification.permission === "default") requestBrowserNotificationPermission();
    setNotice(`${title}: ${body}`);
  }

  function playNotificationSound() {
    if (typeof window === "undefined") return;
    const AudioContextConstructor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return;
    try {
      const audioContext = new AudioContextConstructor();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.24);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.25);
      window.setTimeout(() => void audioContext.close(), 320);
    } catch {
      // Some browsers require a recent user gesture before audio can play.
    }
  }

  function isConversationOpen(conversationId: string) {
    if (conversationId !== selectedIdRef.current) return false;
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) return true;
    return tabRef.current === "chats" && mobilePaneRef.current === "chat";
  }

  function scrollMessagesToBottom(behavior: ScrollBehavior = "smooth") {
    const list = messageListRef.current;
    if (!list) return;
    list.scrollTo({ top: list.scrollHeight, behavior });
  }

  function requestScrollToBottom(behavior: ScrollBehavior = "smooth") {
    pendingScrollBehaviorRef.current = behavior;
    pendingScrollToBottomRef.current = true;
    if (typeof window === "undefined") return;
    const requestId = ++scrollToBottomRequestRef.current;
    const scroll = () => {
      if (scrollToBottomRequestRef.current !== requestId) return;
      scrollMessagesToBottom(behavior);
    };
    window.requestAnimationFrame(scroll);
    window.setTimeout(scroll, 120);
  }

  function restoreTranslationEditScrollPosition() {
    const preserved = translationEditScrollRef.current;
    if (!preserved || preserved.conversationId !== selectedIdRef.current || preserved.expiresAt < Date.now()) return;
    pendingScrollToBottomRef.current = false;
    const restore = () => {
      const current = translationEditScrollRef.current;
      const list = messageListRef.current;
      if (!current || !list || current.conversationId !== selectedIdRef.current) return;
      list.scrollTo({ top: current.scrollTop, behavior: "auto" });
    };
    window.requestAnimationFrame(restore);
    window.setTimeout(restore, 60);
    window.setTimeout(() => {
      restore();
      translationEditScrollRef.current = null;
    }, 220);
  }

  function showLatestMessageAttention(messageId?: string) {
    requestScrollToBottom("smooth");
    if (!messageId) return;
    setHighlightedMessageIds((current) => ({ ...current, [messageId]: true }));
    window.setTimeout(() => {
      setHighlightedMessageIds((current) => {
        if (!current[messageId]) return current;
        const { [messageId]: _removed, ...rest } = current;
        return rest;
      });
    }, 1600);
  }
  function shouldAutoTranslate(message: MessagePayload, targetLanguage: TranslationLanguage) {
    if (!accessTokenRef.current || message.type !== "text" || !message.body?.trim() || parseLocationMessage(message.body) || parseTranslationEditNotice(message.body)) return false;
    if (message.id.startsWith("local-") && messageStatusesRef.current[message.id] === "sending") return false;
    const needsManualSync = manualTranslationNeedsSync(message, targetLanguage);
    if (message.translations?.[targetLanguage] && !needsManualSync) return false;
    if (appearsToAlreadyBeTargetLanguage(message.body, targetLanguage) && !needsManualSync) return false;
    return true;
  }
  function queueAutoTranslation(message: MessagePayload, targetLanguage: TranslationLanguage) {
    if (!shouldAutoTranslate(message, targetLanguage)) return;
    const key = translationRequestKey(message, targetLanguage);
    if (autoTranslationRequestsRef.current.has(key)) return;
    autoTranslationRequestsRef.current.add(key);
    autoTranslationQueueRef.current.push({ message, targetLanguage });
    scheduleAutoTranslationProcessing();
  }

  function queueAutoTranslations(messages: MessagePayload[], targetLanguage: TranslationLanguage) {
    for (const message of messages) queueAutoTranslation(message, targetLanguage);
    scheduleAutoTranslationProcessing();
  }

  function scheduleAutoTranslationProcessing(delay = 0) {
    if (autoTranslationTimerRef.current !== null) return;
    autoTranslationTimerRef.current = window.setTimeout(() => {
      autoTranslationTimerRef.current = null;
      processAutoTranslationQueue();
    }, delay);
  }

  function processAutoTranslationQueue() {
    const maxConcurrent = 2;
    const nextDelayMs = 450;
    while (autoTranslationActiveRef.current < maxConcurrent && autoTranslationQueueRef.current.length > 0) {
      const next = autoTranslationQueueRef.current.shift();
      if (!next) continue;
      if (!shouldAutoTranslate(next.message, next.targetLanguage)) continue;
      autoTranslationActiveRef.current += 1;
      void requestMessageTranslation(next.message, next.targetLanguage, { silent: true }).finally(() => {
        autoTranslationActiveRef.current = Math.max(autoTranslationActiveRef.current - 1, 0);
        if (autoTranslationQueueRef.current.length > 0) { window.setTimeout(processAutoTranslationQueue, nextDelayMs); }
      });
    }
    if (autoTranslationQueueRef.current.length > 0 && autoTranslationActiveRef.current < maxConcurrent) scheduleAutoTranslationProcessing(nextDelayMs);
  }

  function getManualTranslationTarget(message: MessagePayload): TranslationLanguage {
    return translationTargetLanguage;
  }

  async function requestMessageTranslation(message: MessagePayload, targetLanguage: TranslationLanguage, options: { silent?: boolean } = {}) {
    const token = accessTokenRef.current || accessToken;
    if (!token || !message.body?.trim()) return;
    const sameLanguageNotice = uiLabel(uiLanguage, { zh: "目标翻译语言与原文一致，未执行翻译动作。", en: "The target translation language matches the source text, so no translation was performed.", hi: "लक्षित अनुवाद भाषा मूल टेक्स्ट के समान है, इसलिए अनुवाद नहीं किया गया।" });
    if (appearsToAlreadyBeTargetLanguage(message.body, targetLanguage) && !manualTranslationNeedsSync(message, targetLanguage)) {
      setTranslationErrors((current) => {
        if (!current[message.id]) return current;
        const { [message.id]: _removed, ...rest } = current;
        return rest;
      });
      if (!options.silent) setNotice(sameLanguageNotice);
      return;
    }
    setTranslationLoading((current) => ({ ...current, [message.id]: true }));
    if (!options.silent) setNotice(messageActionLabels[uiLanguage].translating);
    try {
      const data = await apiJson<{ message: MessagePayload; translationSkipped?: "same-language" }>(
        `/conversations/${encodeURIComponent(message.conversationId)}/messages/${encodeURIComponent(message.id)}/translate`,
        token,
        {
          method: "POST",
          body: JSON.stringify({ targetLanguage })
        }
      );
      setMessagesByConversation((current) => ({
        ...current,
        [data.message.conversationId]: mergeMessages(current[data.message.conversationId] ?? [], [data.message])
      }));
      setTranslationErrors((current) => {
        if (!current[message.id]) return current;
        const { [message.id]: _removed, ...rest } = current;
        return rest;
      });
      if (!options.silent) setNotice(data.translationSkipped === "same-language" ? sameLanguageNotice : messageActionLabels[uiLanguage].translated);
    } catch (error) {
      const errorMessage = extractErrorMessage(error, messageActionLabels[uiLanguage].translateFailed);
      if (!options.silent) autoTranslationRequestsRef.current.delete(translationRequestKey(message, targetLanguage));
      setTranslationErrors((current) => ({ ...current, [message.id]: errorMessage }));
      if (!options.silent) setNotice(errorMessage);
    } finally {
      setTranslationLoading((current) => ({ ...current, [message.id]: false }));
    }
  }

  async function refreshTranslation(message: MessagePayload) {
    const targetLanguage = getManualTranslationTarget(message);
    const key = translationRequestKey(message, targetLanguage);
    const now = Date.now();
    const cooldownUntil = manualTranslationCooldownRef.current[key] ?? 0;
    if (now < cooldownUntil) {
      setNotice(messageActionLabels[uiLanguage].translationThrottled);
      return;
    }
    manualTranslationCooldownRef.current[key] = now + 3000;
    await requestMessageTranslation(message, targetLanguage);
  }
  function normalizeTranslationEditBody(value: unknown) {
    if (typeof value === "string") return value;
    if (value === null || value === undefined) return "";
    return String(value);
  }

  function clampDocumentPreviewFloatingPosition(x: number, y: number, element: HTMLButtonElement) {
    const margin = 12;
    return {
      x: Math.max(margin, Math.min(x, window.innerWidth - element.offsetWidth - margin)),
      y: Math.max(margin, Math.min(y, window.innerHeight - element.offsetHeight - margin)),
    };
  }

  function beginDocumentPreviewFloatingDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    documentPreviewFloatingDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: rect.left,
      originY: rect.top,
      moved: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function moveDocumentPreviewFloatingDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = documentPreviewFloatingDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dx) + Math.abs(dy) > 6) {
      drag.moved = true;
      documentPreviewFloatingSuppressClickRef.current = true;
    }
    setDocumentPreviewFloatingPosition(clampDocumentPreviewFloatingPosition(drag.originX + dx, drag.originY + dy, event.currentTarget));
  }

  function endDocumentPreviewFloatingDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = documentPreviewFloatingDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    documentPreviewFloatingDragRef.current = null;
    if (drag.moved) window.setTimeout(() => { documentPreviewFloatingSuppressClickRef.current = false; }, 0);
  }

  function restoreDocumentPreviewFromFloating(event: React.MouseEvent<HTMLButtonElement>) {
    if (documentPreviewFloatingSuppressClickRef.current) {
      event.preventDefault();
      documentPreviewFloatingSuppressClickRef.current = false;
      return;
    }
    setDocumentPreviewMinimized(false);
  }

  function closeDocumentPreview() {
    setDocumentPreview(null);
    setDocumentPreviewMinimized(false);
  }

  async function openDocumentPreview(message: MessagePayload) {
    const path = documentPreviewPath(message);
    if (!path || !accessToken) return;
    setDocumentPreviewMinimized(false);
    setDocumentPreviewZoom(1);
    setDocumentPreviewRotation(0);
    setDocumentConverting(false);
    setDocumentTranslationTarget(translationTargetLanguage);
    setDocumentTranslating(false);
    setDocumentTranslationStatus("");
    setDocumentTranslatedFile(null);
    setDocumentTranslationViewMode("original");
    setDocumentPreviewScrollProgress(0);
    const extension = (message.body || "").split(".").pop()?.toLowerCase();
    setDocumentSaveFormat(["doc", "docx", "odt", "rtf", "wps"].includes(extension || "") ? "docx" : ["xls", "xlsx", "ods", "et"].includes(extension || "") ? "xlsx" : ["ppt", "pptx", "odp", "dps"].includes(extension || "") ? "pptx" : "pdf");
    setDocumentPreview({ fileName: message.body || "Document", mimeType: "application/octet-stream", kind: "unsupported", loading: true, downloadUrl: mediaDownloadUrl(message), sourceMessage: message });
    try {
      const data = await apiJson<DocumentPreviewResponse>(path, accessToken, undefined, 210_000);
      setDocumentPreview({
        ...data,
        url: data.url ? normalizeMediaUrl(data.url) : undefined,
        downloadUrl: mediaDownloadUrl(message),
        sourceMessage: message
      });
    } catch (error) {
      setDocumentPreview({ fileName: message.body || "Document", mimeType: "application/octet-stream", kind: "unsupported", error: extractErrorMessage(error, t.requestFailed), downloadUrl: mediaDownloadUrl(message), sourceMessage: message });
    }
  }

  async function translatePreviewDocument() {
    const source = documentPreview?.sourceMessage;
    const path = source ? documentTranslatePath(source) : "";
    if (!source || !path || !accessToken || documentTranslating) return;
    const documentLabel = translatableDocumentLabel(source) || "Document";
    setDocumentTranslating(true);
    setDocumentTranslatedFile(null);
    setDocumentTranslationViewMode("original");
    setDocumentTranslationStatus(uiLabel(uiLanguage, { zh: `正在识别并翻译 ${documentLabel} 文件…`, en: `Reading and translating the ${documentLabel} file…`, hi: `${documentLabel} फ़ाइल पढ़कर अनुवाद किया जा रहा है…` }));
    try {
      const result = await apiJson<DocumentTranslationReply>(path, accessToken, { method: "POST", body: JSON.stringify({ targetLanguage: documentTranslationTarget }) }, 660_000);
      if (!result.generatedFile) throw new Error(uiLabel(uiLanguage, { zh: "翻译完成，但没有生成译文 PDF。", en: "Translation completed, but no translated PDF was generated.", hi: "अनुवाद पूरा हुआ, लेकिन अनुवादित PDF नहीं बनी।" }));
      const generated = { ...result.generatedFile, url: normalizeMediaUrl(result.generatedFile.url) ?? result.generatedFile.url };
      setDocumentTranslatedFile(generated);
      setDocumentTranslationStatus(uiLabel(uiLanguage, { zh: `${documentLabel} 翻译完成，可选择原文、译文或双语对照。`, en: `${documentLabel} translation is ready in original, translated, or bilingual view.`, hi: `${documentLabel} अनुवाद तैयार है; मूल, अनुवाद या द्विभाषी दृश्य चुनें।` }));
    } catch (error) {
      setDocumentTranslationStatus(extractErrorMessage(error, uiLabel(uiLanguage, { zh: `${documentLabel} 翻译失败，请稍后重试。`, en: `${documentLabel} translation failed. Please try again.`, hi: `${documentLabel} अनुवाद विफल रहा। फिर कोशिश करें।` })));
    } finally { setDocumentTranslating(false); }
  }

  function setTranslatedPdfViewMode(mode: DocumentTranslationViewMode) {
    setDocumentTranslationViewMode(mode);
    setDocumentPreviewRotation(0);
    setDocumentPreviewZoom(1);
  }

  function officeFormatOptions(fileName: string): OfficeConversionFormat[] {
    const extension = fileName.split(".").pop()?.toLowerCase() || "";
    if (["doc", "docx", "odt", "rtf", "wps"].includes(extension)) return ["docx", "doc", "odt", "pdf"];
    if (["xls", "xlsx", "ods", "et"].includes(extension)) return ["xlsx", "xls", "ods", "pdf"];
    if (["ppt", "pptx", "odp", "dps"].includes(extension)) return ["pptx", "ppt", "odp", "pdf"];
    return [];
  }

  async function convertPreviewDocument(format: OfficeConversionFormat, repair = false) {
    const source = documentPreview?.sourceMessage;
    const path = source ? documentConvertPath(source) : "";
    if (!source || !path || !accessToken || documentConverting) return;
    setDocumentConverting(true);
    setDocumentPreview((current) => current ? { ...current, convertedFile: undefined, error: undefined, conversionStatus: repair ? uiLabel(uiLanguage, { zh: "正在修复并重新保存文件…", en: "Repairing and re-saving the file…", hi: "फ़ाइल की मरम्मत और पुनः सहेजा जा रहा है…" }) : uiLabel(uiLanguage, { zh: "正在转换并另存文件…", en: "Converting and saving a copy…", hi: "फ़ाइल बदलकर प्रति सहेजी जा रही है…" }) } : current);
    try {
      const baseName = (source.body || "document").replace(/\.[^.]+$/, "");
      const suffix = repair ? uiLabel(uiLanguage, { zh: "-已修复", en: "-repaired", hi: "-मरम्मत" }) : uiLabel(uiLanguage, { zh: "-另存", en: "-converted", hi: "-परिवर्तित" });
      const generated = await apiJson<UploadedMediaResponse>(path, accessToken, { method: "POST", body: JSON.stringify({ format, fileName: `${baseName}${suffix}.${format}` }) }, 210_000);
      setDocumentPreview((current) => current ? { ...current, convertedFile: generated, conversionStatus: repair ? uiLabel(uiLanguage, { zh: "文件修复完成，可下载或重新发送。", en: "Repair completed. Download or resend the repaired file.", hi: "मरम्मत पूरी हुई। फ़ाइल डाउनलोड या फिर भेजें।" }) : uiLabel(uiLanguage, { zh: "另存为已完成，可下载或重新发送。", en: "Save As completed. Download or resend the converted file.", hi: "Save As पूरा हुआ। फ़ाइल डाउनलोड या फिर भेजें।" }) } : current);
    } catch (error) {
      setDocumentPreview((current) => current ? { ...current, conversionStatus: extractErrorMessage(error, uiLabel(uiLanguage, { zh: "文件修复或转换失败。", en: "File repair or conversion failed.", hi: "फ़ाइल मरम्मत या रूपांतरण विफल रहा।" })) } : current);
    } finally {
      setDocumentConverting(false);
    }
  }

  async function sendAssistantGeneratedFile(generated: UploadedMediaResponse) {
    if (!selectedExists || !accessToken) {
      setNotice(uiLabel(uiLanguage, { zh: "请先选择一个聊天会话，再发送助手生成的文件。", en: "Select a conversation before sending the generated file.", hi: "बनाई गई फ़ाइल भेजने से पहले कोई चैट चुनें।" }));
      return false;
    }
    try {
      const url = normalizeMediaUrl(generated.url) ?? generated.url;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const file = new File([blob], generated.fileName, { type: generated.mimeType || blob.type || "application/octet-stream" });
      return await sendMediaFile(file, undefined, "original");
    } catch (error) {
      setNotice(extractErrorMessage(error, uiLabel(uiLanguage, { zh: "助手生成的文件发送失败。", en: "Could not send the assistant-generated file.", hi: "सहायक द्वारा बनाई गई फ़ाइल नहीं भेजी जा सकी।" })));
      return false;
    }
  }

  function startTranslationEdit(message: MessagePayload, targetLanguage: TranslationLanguage, translated: unknown) {
    const manual = message.manualTranslations?.[targetLanguage];
    const manualBody = normalizeTranslationEditBody(manual?.body);
    const sourceTranslation = normalizeTranslationEditBody(translated);
    const body = manualBody.trim() ? manualBody : sourceTranslation;
    translationEditBodyRef.current = body;
    translationEditBodyKeyRef.current = `${message.id}:${targetLanguage}`;
    setTranslationEditDraft({ messageId: message.id, targetLanguage, body });
  }

  function cancelTranslationEdit() {
    translationEditBodyRef.current = "";
    translationEditBodyKeyRef.current = "";
    setTranslationEditDraft(null);
  }

  async function saveTranslationEdit(message: MessagePayload) {
    const draft = translationEditDraft;
    const token = accessTokenRef.current || accessToken;
    if (!draft || draft.messageId !== message.id || !token) return;
    // The textarea is controlled by translationEditDraft. Use React state as
    // the source of truth; reading a reused DOM ref here could return an empty
    // value from a previous message and incorrectly reject a non-empty edit.
    const rawBody = draft.body;
    const body = normalizeTranslationEditBody(rawBody).replace(/\u00a0/g, " ").trim();
    if (!body) {
      setNotice(uiLabel(uiLanguage, { zh: '修改后的翻译不能为空。', en: 'The edited translation cannot be empty.', hi: 'संशोधित अनुवाद खाली नहीं हो सकता।' }));
      return;
    }
    translationEditScrollRef.current = {
      conversationId: message.conversationId,
      scrollTop: messageListRef.current?.scrollTop ?? 0,
      expiresAt: Date.now() + 5000
    };
    setTranslationEditSaving(true);
    try {
      const data = await apiJson<{ message: MessagePayload; translationSkipped?: "same-language" }>(
        `/conversations/${encodeURIComponent(message.conversationId)}/messages/${encodeURIComponent(message.id)}/translation`,
        token,
        { method: 'PATCH', body: JSON.stringify({ targetLanguage: draft.targetLanguage, body, editedBody: body }) }
      );
      setMessagesByConversation((current) => ({
        ...current,
        [data.message.conversationId]: mergeMessages(current[data.message.conversationId] ?? [], [data.message])
      }));
      translationEditBodyRef.current = "";
      translationEditBodyKeyRef.current = "";
      setTranslationEditDraft(null);
      restoreTranslationEditScrollPosition();
      setNotice(uiLabel(uiLanguage, { zh: '翻译修改已保存。', en: 'Translation edit saved.', hi: 'अनुवाद संशोधन सहेजा गया।' }));
    } catch (error) {
      restoreTranslationEditScrollPosition();
      setNotice(extractErrorMessage(error, uiLabel(uiLanguage, { zh: '翻译修改保存失败。', en: 'Could not save the translation edit.', hi: 'अनुवाद संशोधन सहेजा नहीं जा सका।' })));
    } finally {
      setTranslationEditSaving(false);
    }
  }

  function setReminderForMessage(message: MessagePayload) {
    const fallback = new Date(Date.now() + 60 * 60 * 1000);
    fallback.setSeconds(0, 0);
    const defaultValue = `${fallback.getFullYear()}-${String(fallback.getMonth() + 1).padStart(2, "0")}-${String(fallback.getDate()).padStart(2, "0")} ${String(fallback.getHours()).padStart(2, "0")}:${String(fallback.getMinutes()).padStart(2, "0")}`;
    const input = window.prompt(uiLabel(uiLanguage, { zh: "输入提醒时间，例如 2026-07-10 18:30", en: "Enter reminder time, for example 2026-07-10 18:30", hi: "रिमाइंडर समय दर्ज करें, जैसे 2026-07-10 18:30" }), defaultValue);
    if (!input) return;
    const normalized = input.trim().replace(" ", "T");
    const remindAt = new Date(normalized);
    if (Number.isNaN(remindAt.getTime()) || remindAt.getTime() <= Date.now()) {
      setNotice(uiLabel(uiLanguage, { zh: "提醒时间无效。", en: "Invalid reminder time.", hi: "रिमाइंडर समय मान्य नहीं है।" }));
      return;
    }
    if (typeof window !== "undefined" && "Notification" in window && window.Notification.permission === "default") void window.Notification.requestPermission();
    const conversation = conversationsRef.current.find((item) => item.id === message.conversationId);
    const body = mediaPreviewLabel(message).slice(0, 180) || message.transcript || `[${message.type}]`;
    setMessageReminders((items) => [{ id: createBrowserId(), conversationId: message.conversationId, messageId: message.id, title: conversation?.name ?? message.senderName ?? "Glimpse Chat", body, remindAt: remindAt.toISOString() }, ...items]);
    setNotice(messageActionLabels[uiLanguage].reminderSet);
  }

  function startReply(message: MessagePayload) {
    setReplyingToMessage({
      id: message.id,
      senderName: message.senderName,
      type: message.type,
      body: mediaPreviewLabel(message).slice(0, 180)
    });
  }
  function parseFavoriteTags(input: string) {
    const seen = new Set<string>();
    const tags: string[] = [];
    for (const item of input.split(/[,#，、\s]+/)) {
      const tag = item.trim().replace(/^#+/, "").slice(0, 24);
      const key = tag.toLowerCase();
      if (!tag || seen.has(key)) continue;
      seen.add(key);
      tags.push(tag);
      if (tags.length >= 8) break;
    }
    return tags;
  }

  function promptFavoriteTags() {
    const input = window.prompt(uiLabel(uiLanguage, { zh: "输入收藏标签，可用逗号、空格或顿号分隔", en: "Enter favorite tags, separated by comma or space", hi: "पसंदीदा टैग दर्ज करें; कॉमा या स्पेस से अलग करें" }), "");
    if (input === null) return null;
    return parseFavoriteTags(input);
  }
  async function loadFavorites(token = accessToken) {
    if (!token) return;
    setFavoritesLoading(true);
    try {
      const result = await apiJson<{ favorites: FavoriteMessageView[] }>("/favorites", token);
      setFavoriteMessages(result.favorites);
      setFavoriteMessageIds(new Set(result.favorites.map((item) => item.message.id)));
    } catch (error) {
      setNotice(extractErrorMessage(error, uiLabel(uiLanguage, { zh: "收藏加载失败。", en: "Failed to load favorites.", hi: "पसंदीदा संदेश लोड नहीं हुए।" })));
    } finally {
      setFavoritesLoading(false);
    }
  }

  function isMessagePendingForFavorite(message: MessagePayload) {
    const status = messageStatusesRef.current[message.id];
    return status === "sending" || status === "failed";
  }

  async function toggleFavoriteMessage(message: MessagePayload) {
    if (!accessToken || message.revokedAt) return;
    if (isMessagePendingForFavorite(message)) {
      setNotice(uiLabel(uiLanguage, { zh: "消息发送完成后才能收藏。", en: "You can favorite this message after it is sent.", hi: "संदेश भेजे जाने के बाद ही उसे पसंदीदा बनाया जा सकता है।" }));
      return;
    }
    const wasFavorite = favoriteMessageIds.has(message.id);
    setFavoriteMessageIds((current) => {
      const next = new Set(current);
      if (wasFavorite) next.delete(message.id);
      else next.add(message.id);
      return next;
    });
    try {
      if (wasFavorite) {
        await apiJson<{ ok: true }>("/favorites/" + encodeURIComponent(message.id), accessToken, { method: "DELETE" });
        setFavoriteMessages((items) => items.filter((item) => item.message.id !== message.id));
        setNotice(uiLabel(uiLanguage, { zh: "已取消收藏。", en: "Removed from favorites.", hi: "पसंदीदा से हटा दिया गया।" }));
      } else {
        const tags = promptFavoriteTags();
        if (tags === null) throw new Error("FAVORITE_CANCELLED");
        const result = await apiJson<{ favorite: FavoriteMessageView }>("/favorites", accessToken, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId: message.id, tags })
        });
        setFavoriteMessages((items) => [result.favorite, ...items.filter((item) => item.message.id !== message.id)]);
        setNotice(uiLabel(uiLanguage, { zh: "已收藏。", en: "Added to favorites.", hi: "पसंदीदा में जोड़ दिया गया।" }));
      }
    } catch (error) {
      setFavoriteMessageIds((current) => {
        const next = new Set(current);
        if (wasFavorite) next.add(message.id);
        else next.delete(message.id);
        return next;
      });
      if (error instanceof Error && error.message === "FAVORITE_CANCELLED") return;
      setNotice(extractErrorMessage(error, uiLabel(uiLanguage, { zh: "收藏操作失败。", en: "Favorite action failed.", hi: "पसंदीदा कार्रवाई विफल रही।" })));
    }
  }

  async function favoriteSelectedMessages() {
    if (!accessToken) return;
    const selectedMessages = selectedMessagesForCurrentConversation().filter((message) => !message.revokedAt);
    const messages = selectedMessages.filter((message) => !isMessagePendingForFavorite(message));
    if (messages.length === 0) {
      setNotice(uiLabel(uiLanguage, { zh: "所选消息发送完成后才能收藏。", en: "Selected messages can be favorited after they are sent.", hi: "चुने गए संदेश भेजे जाने के बाद ही पसंदीदा बनाए जा सकते हैं।" }));
      return;
    }
    const tags = promptFavoriteTags();
    if (tags === null) return;
    let done = 0;
    for (const message of messages) {
      try {
        const result = await apiJson<{ favorite: FavoriteMessageView }>("/favorites", accessToken, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId: message.id, tags })
        });
        done += 1;
        setFavoriteMessages((items) => [result.favorite, ...items.filter((item) => item.message.id !== message.id)]);
      } catch {
        // Keep trying the rest of the selected messages.
      }
    }
    if (done > 0) {
      setFavoriteMessageIds((current) => {
        const next = new Set(current);
        for (const message of messages) next.add(message.id);
        return next;
      });
      setNotice(uiLabel(uiLanguage, { zh: "已收藏所选消息。", en: "Selected messages added to favorites.", hi: "चुने गए संदेश पसंदीदा में जोड़ दिए गए।" }));
      cancelMessageSelection();
    } else {
      setNotice(uiLabel(uiLanguage, { zh: "收藏失败。", en: "Favorite action failed.", hi: "पसंदीदा कार्रवाई विफल रही।" }));
    }
  }

  function jumpToFavoriteMessage(item: FavoriteMessageView) {
    setFavoritesOpen(false);
    setFavoritePreviewItem(null);
    setFavoritesSendMode(false);
    setSelectedId(item.message.conversationId);
    setMobilePane("chat");
    setMessagesByConversation((current) => ({
      ...current,
      [item.message.conversationId]: mergeMessages(current[item.message.conversationId] ?? [], [item.message])
    }));
    window.setTimeout(() => void jumpToMessage(item.message.id), 180);
  }

  function openFavoriteMessage(item: FavoriteMessageView) {
    if (favoritesSendMode) {
      sendFavoriteMessage(item);
      return;
    }
    const message = item.message;
    if ((message.type === "image" || message.type === "video" || message.type === "audio") && message.mediaUrl) {
      setPreviewRotation(0);
      setPreviewZoom(1);
      setPreviewVideoFit("auto");
      setPreviewVideoSize(null);
      setPreviewMedia({ url: mediaPreviewUrl(message), type: message.type, name: message.body, ...(message.type === "video" ? { muted: false } : {}) });
      return;
    }
    if (message.type === "file" && message.mediaUrl) {
      window.open(mediaPreviewUrl(message), "_blank", "noopener,noreferrer");
      return;
    }
    setFavoritePreviewItem(item);
  }

  function clearFavoriteLongPressTimer() {
    if (favoriteLongPressTimerRef.current) window.clearTimeout(favoriteLongPressTimerRef.current);
    favoriteLongPressTimerRef.current = null;
    favoriteLongPressStartRef.current = null;
  }

  function handleFavoritePointerDown(event: React.PointerEvent, item: FavoriteMessageView) {
    if (event.button !== 0) return;
    clearFavoriteLongPressTimer();
    favoriteLongPressTriggeredRef.current = false;
    favoriteLongPressStartRef.current = { x: event.clientX, y: event.clientY };
    favoriteLongPressTimerRef.current = window.setTimeout(() => {
      favoriteLongPressTimerRef.current = null;
      favoriteLongPressStartRef.current = null;
      favoriteLongPressTriggeredRef.current = true;
      setFavoriteActionItem(item);
    }, 520);
  }

  function handleFavoritePointerMove(event: React.PointerEvent) {
    const start = favoriteLongPressStartRef.current;
    if (!start) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) clearFavoriteLongPressTimer();
  }

  function handleFavoriteClick(event: React.MouseEvent, item: FavoriteMessageView) {
    if (favoriteLongPressTriggeredRef.current) {
      event.preventDefault();
      favoriteLongPressTriggeredRef.current = false;
      return;
    }
    openFavoriteMessage(item);
  }

  async function removeFavoriteItem(item: FavoriteMessageView) {
    if (!accessToken) return;
    try {
      await apiJson<{ ok: true }>(`/favorites/${encodeURIComponent(item.message.id)}`, accessToken, { method: "DELETE" });
      setFavoriteMessages((items) => items.filter((favorite) => favorite.id !== item.id));
      setFavoriteMessageIds((current) => { const next = new Set(current); next.delete(item.message.id); return next; });
      setFavoriteActionItem(null);
      setFavoritePreviewItem((current) => current?.id === item.id ? null : current);
      setNotice(uiLabel(uiLanguage, { zh: "收藏已删除。", en: "Favorite deleted.", hi: "पसंदीदा हटा दिया गया।" }));
    } catch (error) {
      setNotice(extractErrorMessage(error, uiLabel(uiLanguage, { zh: "删除收藏失败。", en: "Could not delete favorite.", hi: "पसंदीदा नहीं हट सका।" })));
    }
  }

  function forwardFavoriteItem(item: FavoriteMessageView) {
    setFavoriteActionItem(null);
    setFavoritesOpen(false);
    setFavoritePreviewItem(null);
    openForwardMessages([item.message]);
  }

  function favoriteTranslation(item: FavoriteMessageView) {
    const target = getManualTranslationTarget(item.message);
    return { target, body: item.message.manualTranslations?.[target]?.body ?? item.message.translations?.[target] };
  }

  function sendFavoriteMessage(item: FavoriteMessageView) {
    if (!currentUser || !selectedExists || item.message.revokedAt) return;
    const now = Date.now();
    const source = item.message;
    const message: MessagePayload = {
      id: "local-" + now + "-favorite-" + createBrowserId(),
      conversationId: selected.id,
      senderId: currentUser.id,
      senderName: currentUser.nickname,
      type: source.type,
      body: source.body,
      mediaUrl: source.mediaUrl,
      thumbnailUrl: source.thumbnailUrl,
      mediaSizeBytes: source.mediaSizeBytes,
      transcript: source.transcript,
      sourceLanguage: source.sourceLanguage ?? "auto",
      targetLanguage: translationTargetLanguage,
      createdAt: new Date(now).toISOString()
    };
    setMessagesByConversation((current) => ({
      ...current,
      [selected.id]: mergeMessages(current[selected.id] ?? [], [message])
    }));
    showLatestMessageAttention(message.id);
    emitMessage(message);
    setConversations((items) => items.map((conversation) => conversation.id === selected.id ? {
      ...conversation,
      preview: mediaPreviewLabel(message),
      time: formatConversationTime(message.createdAt),
      latestMessageAt: message.createdAt
    } : conversation));
    setFavoritesOpen(false);
    setFavoritesSendMode(false);
    setNotice(uiLabel(uiLanguage, { zh: "\u5df2\u4ece\u6536\u85cf\u53d1\u9001", en: "Sent from favorites.", hi: "पसंदीदा से भेज दिया गया।" }));
  }

  async function copyPlainMessageText(text: string, successNotice: string) {
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(text);
          setNotice(successNotice);
          return;
        } catch {
          // Fall through to the textarea copy path when browser permissions block Clipboard API.
        }
      }
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      if (!copied) throw new Error("Copy command failed.");
      setNotice(successNotice);
    } catch {
      setNotice(messageActionLabels[uiLanguage].copyFailed);
    }
  }

  function normalizeBrowserSpeechLanguage(value: string) {
    return value.trim().replace(/_/g, "-").toLowerCase();
  }

  function findBrowserSpeechVoice(voices: SpeechSynthesisVoice[], targetLanguage: string) {
    const normalizedTarget = normalizeBrowserSpeechLanguage(targetLanguage);
    const targetBase = normalizedTarget.split("-")[0];
    return voices.find((item) => normalizeBrowserSpeechLanguage(item.lang) === normalizedTarget)
      ?? voices.find((item) => normalizeBrowserSpeechLanguage(item.lang).split("-")[0] === targetBase)
      ?? null;
  }

  async function getBrowserSpeechVoices(targetLanguage: string) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return [] as SpeechSynthesisVoice[];
    const readVoices = () => window.speechSynthesis.getVoices();
    const immediate = readVoices();
    if (findBrowserSpeechVoice(immediate, targetLanguage)) return immediate;
    return await new Promise<SpeechSynthesisVoice[]>((resolve) => {
      let settled = false;
      let latest = immediate;
      let pollTimer = 0;
      let timeoutTimer = 0;
      const finish = () => {
        if (settled) return;
        settled = true;
        window.clearInterval(pollTimer);
        window.clearTimeout(timeoutTimer);
        window.speechSynthesis.removeEventListener("voiceschanged", refresh);
        resolve(latest);
      };
      const refresh = () => {
        latest = readVoices();
        if (findBrowserSpeechVoice(latest, targetLanguage)) finish();
      };
      window.speechSynthesis.addEventListener("voiceschanged", refresh);
      pollTimer = window.setInterval(refresh, 200);
      timeoutTimer = window.setTimeout(finish, 3000);
      refresh();
    });
  }

  async function readMessageText(text: string | undefined, language: string, key: string) {
    const content = text?.trim();
    if (!content) {
      setNotice(uiLabel(uiLanguage, { zh: "没有可朗读的文字。", en: "There is no text to read.", hi: "पढ़ने के लिए कोई टेक्स्ट नहीं है।" }));
      return;
    }
    if (speakingMessageKey === key) {
      ttsPlaybackRunRef.current += 1;
      ttsAbortRef.current?.abort();
      ttsAbortRef.current = null;
      if (ttsAudioRef.current) {
        ttsAudioRef.current.pause();
        ttsAudioRef.current = null;
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
      setSpeakingMessageKey("");
      return;
    }

    const playbackRunId = ttsPlaybackRunRef.current + 1;
    ttsPlaybackRunRef.current = playbackRunId;
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = null;
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    const playbackIsActive = () => ttsPlaybackRunRef.current === playbackRunId;

    let activeTtsConfig = ttsConfig;
    if (activeTtsConfig.provider === "loading") {
      const refreshed = await loadTtsRuntimeConfig(accessTokenRef.current || accessToken);
      if (!refreshed || !playbackIsActive()) {
        if (playbackIsActive()) setNotice(uiLabel(uiLanguage, { zh: "朗读配置加载失败，请检查网络后重试。", en: "Could not load read-aloud settings. Check the network and try again.", hi: "पढ़ने की सेटिंग लोड नहीं हुई। नेटवर्क जांचकर फिर प्रयास करें।" }));
        return;
      }
      activeTtsConfig = refreshed;
    }

    if (["doubao", "aliyun_bailian"].includes(activeTtsConfig.provider)) {
      if (!accessToken) return;
      try {
        setSpeakingMessageKey(key);
        const chunks = splitTextForTts(content, 700);
        const cloudVoice = selectedTtsVoiceType || (activeTtsConfig.provider === "aliyun_bailian" ? activeTtsConfig.aliyun.voiceType : activeTtsConfig.doubao.voiceType);
        for (const chunk of chunks) {
          if (!playbackIsActive()) return;
          const abortController = new AbortController();
          ttsAbortRef.current = abortController;
          const response = await fetchWithTimeout(`${getApiUrl()}/voice/tts`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ text: chunk, language, voiceType: cloudVoice }),
            signal: abortController.signal
          }, 70000);
          if (!response.ok) {
            const errorText = await response.text().catch(() => "");
            throw new Error(apiErrorMessage(errorText ? JSON.parse(errorText) : {}, uiLabel(uiLanguage, { zh: "云端朗读失败。", en: "Cloud read-aloud failed.", hi: "क्लाउड वाचन विफल रहा।" })));
          }
          const blob = await response.blob();
          if (!playbackIsActive()) return;
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          ttsAudioRef.current = audio;
          await new Promise<void>((resolve, reject) => {
            const stopPlayback = () => resolve();
            abortController.signal.addEventListener("abort", stopPlayback, { once: true });
            audio.onended = () => resolve();
            audio.onerror = () => playbackIsActive() ? reject(new Error(uiLabel(uiLanguage, { zh: "云端朗读音频播放失败。", en: "Cloud audio playback failed.", hi: "क्लाउड ऑडियो चल नहीं सका।" }))) : resolve();
            void audio.play().catch(reject);
          }).finally(() => {
            audio.pause();
            URL.revokeObjectURL(url);
            if (ttsAudioRef.current === audio) ttsAudioRef.current = null;
          });
        }
        if (playbackIsActive()) {
          ttsAbortRef.current = null;
          setSpeakingMessageKey((current) => (current === key ? "" : current));
        }
        return;
      } catch (error) {
        if (!playbackIsActive()) return;
        ttsAbortRef.current = null;
        setSpeakingMessageKey((current) => (current === key ? "" : current));
        setNotice(extractErrorMessage(error, uiLabel(uiLanguage, { zh: "云端朗读失败。", en: "Cloud read-aloud failed.", hi: "क्लाउड वाचन विफल रहा।" })));
        return;
      }
    }

    if (activeTtsConfig.provider !== "browser") {
      setNotice(uiLabel(uiLanguage, { zh: `后台朗读引擎配置无效：${activeTtsConfig.provider}`, en: `Invalid backend read-aloud provider: ${activeTtsConfig.provider}`, hi: `बैकएंड वाचन प्रदाता मान्य नहीं है: ${activeTtsConfig.provider}` }));
      return;
    }
    if (typeof window === "undefined" || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      setNotice(messageActionLabels[uiLanguage].speechUnavailable);
      return;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    if (!playbackIsActive()) return;
    const selectedLanguage = speechAccent === "auto" ? language : speechAccent;
    const voices = await getBrowserSpeechVoices(selectedLanguage);
    if (!playbackIsActive()) return;
    const voice = findBrowserSpeechVoice(voices, selectedLanguage);
    const browserSpeechFailureMessage = (errorName: string) => {
      const detail = errorName ? uiLabel(uiLanguage, { zh: `错误：${errorName}`, en: `Error: ${errorName}`, hi: `त्रुटि: ${errorName}` }) : uiLabel(uiLanguage, { zh: "未返回具体错误", en: "No detailed error was returned", hi: "विस्तृत त्रुटि नहीं मिली" });
      return uiLanguage === "zh"
        ? `浏览器朗读失败（${detail}）。请确认浏览器或系统已安装 ${selectedLanguage} 语音。`
        : uiLanguage === "hi"
          ? `ब्राउज़र वाचन विफल रहा (${detail})। सुनिश्चित करें कि ब्राउज़र या सिस्टम में ${selectedLanguage} आवाज़ स्थापित है।`
          : `Browser read-aloud failed (${detail}). Make sure a ${selectedLanguage} voice is installed in the browser or operating system.`;
    };
    const chunks = splitTextForTts(content, 300);
    const speakWithBrowser = (chunkIndex: number) => {
      if (!playbackIsActive()) return;
      const utterance = new SpeechSynthesisUtterance(chunks[chunkIndex]);
      utterance.lang = selectedLanguage;
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.volume = 1;
      if (voice) utterance.voice = voice;
      utterance.onend = () => {
        if (!playbackIsActive()) return;
        if (chunkIndex + 1 < chunks.length) {
          window.setTimeout(() => speakWithBrowser(chunkIndex + 1), 20);
        } else {
          setSpeakingMessageKey((current) => (current === key ? "" : current));
        }
      };
      utterance.onerror = (event) => {
        if (!playbackIsActive()) return;
        const errorName = typeof event.error === "string" ? event.error : "";
        if (errorName === "canceled" || errorName === "interrupted") {
          setSpeakingMessageKey((current) => (current === key ? "" : current));
          return;
        }
        setSpeakingMessageKey((current) => (current === key ? "" : current));
        setNotice(browserSpeechFailureMessage(errorName));
      };
      window.speechSynthesis.speak(utterance);
      window.setTimeout(() => { if (window.speechSynthesis.paused) window.speechSynthesis.resume(); }, 250);
    };
    setSpeakingMessageKey(key);
    speakWithBrowser(0);
  }

  async function readOriginalMessage(message: MessagePayload) {
    const fallback = message.sourceLanguage && message.sourceLanguage !== "auto" ? message.sourceLanguage : "en";
    await readMessageText(message.body ?? message.transcript, inferSpeechLanguage(message.body ?? message.transcript, fallback), message.id + ":original");
  }

  async function readTranslatedMessage(message: MessagePayload, translated: string, targetLanguage: TranslationLanguage) {
    await readMessageText(translated, speechLanguageByTranslationLanguage[targetLanguage], message.id + ":translation:" + targetLanguage);
  }

  function resetLocationDraft() {
    setLocationName("");
    setLocationLatitude("");
    setLocationLongitude("");
  }

  function useCurrentLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setNotice(uiLabel(uiLanguage, { zh: "此浏览器不支持定位。", en: "Location is not available in this browser.", hi: "इस ब्राउज़र में स्थान सुविधा उपलब्ध नहीं है।" }));
      return;
    }
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationLatitude(position.coords.latitude.toFixed(6));
        setLocationLongitude(position.coords.longitude.toFixed(6));
        if (!locationName.trim()) setLocationName(uiLabel(uiLanguage, { zh: "当前位置", en: "Current location", hi: "वर्तमान स्थान" }));
        setLocationLoading(false);
      },
      (error) => {
        setNotice(error.message || uiLabel(uiLanguage, { zh: "无法获取当前位置。", en: "Could not get current location.", hi: "वर्तमान स्थान नहीं मिल सका।" }));
        setLocationLoading(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  }

  function sendLocationMessage() {
    if (!currentUser || !selectedExists) return;
    const latitude = Number(locationLatitude.trim());
    const longitude = Number(locationLongitude.trim());
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      setNotice(uiLabel(uiLanguage, { zh: "请输入有效的经纬度。", en: "Enter a valid latitude and longitude.", hi: "मान्य अक्षांश और देशांतर दर्ज करें।" }));
      return;
    }
    const location: LocationMessagePayload = {
      latitude,
      longitude,
      name: locationName.trim() || undefined
    };
    const reply = replyingToMessage;
    const message: MessagePayload = {
      id: `local-${Date.now()}-${createBrowserId()}`,
      conversationId: selected.id,
      senderId: currentUser.id,
      senderName: currentUser.nickname,
      type: "text",
      body: encodeLocationMessage(location),
      ...(reply
        ? {
            replyToMessageId: reply.id,
            replyToMessageSenderName: reply.senderName,
            replyToMessageType: reply.type,
            replyToMessageBody: reply.body
          }
        : {}),
      sourceLanguage: "auto",
      targetLanguage: translationTargetLanguage,
      createdAt: new Date().toISOString()
    };
    setMessagesByConversation((current) => ({
      ...current,
      [selected.id]: mergeMessages(current[selected.id] ?? [], [message])
    }));
    showLatestMessageAttention(message.id);
    setMessageStatuses((current) => ({ ...current, [message.id]: "sending" }));
    emitMessage(message);
    const preview = mediaPreviewLabel(message);
    setConversations((items) => items.map((item) => (item.id === selected.id ? { ...item, preview, time: formatConversationTime(message.createdAt), latestMessageAt: message.createdAt } : item)));
    setLocationModalOpen(false);
    resetLocationDraft();
    setReplyingToMessage(null);
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    const filesToSend = pendingComposerFiles.slice();
    if ((!body && filesToSend.length === 0) || !currentUser || !selectedExists) return;
    if (body) {
    const reply = replyingToMessage;
    const message: MessagePayload = {
      id: `local-${Date.now()}-${createBrowserId()}`,
      conversationId: selected.id,
      senderId: currentUser.id,
      senderName: currentUser.nickname,
      type: "text",
      body,
      ...(reply
        ? {
            replyToMessageId: reply.id,
            replyToMessageSenderName: reply.senderName,
            replyToMessageType: reply.type,
            replyToMessageBody: reply.body
          }
        : {}),
      sourceLanguage: "auto",
      targetLanguage: translationTargetLanguage,
      createdAt: new Date().toISOString()
    };

    setMessagesByConversation((current) => ({
      ...current,
      [selected.id]: mergeMessages(current[selected.id] ?? [], [message])
    }));
    showLatestMessageAttention(message.id);
    setMessageStatuses((current) => ({ ...current, [message.id]: "sending" }));

    emitMessage(message);

    setConversations((items) =>
      items.map((item) => (item.id === selected.id ? { ...item, preview: body, time: formatConversationTime(message.createdAt), latestMessageAt: message.createdAt } : item))
    );
    setDraft("");
    setReplyingToMessage(null);
    }
    if (filesToSend.length > 0) {
      const selectedMediaVariant = mediaSendVariant;
      setPendingComposerFiles([]);
      setMediaSendVariant("preview");
      const albumMediaFiles = filesToSend.filter((file) => ["image", "video"].includes(mediaTypeFromFile(file)));
      const albumId = albumMediaFiles.length > 1 ? `album-${Date.now()}-${createBrowserId()}` : undefined;
      let albumIndex = 0;
      const albums = filesToSend.map((file) => albumId && ["image", "video"].includes(mediaTypeFromFile(file))
          ? { id: albumId, index: albumIndex++, size: albumMediaFiles.length }
          : undefined);
      const optimisticMessages = filesToSend.map((file, index) => createOptimisticMediaMessage(file, albums[index]));
      setMessagesByConversation((current) => ({
        ...current,
        [selected.id]: mergeMessages(current[selected.id] ?? [], optimisticMessages)
      }));
      setMessageStatuses((current) => ({
        ...current,
        ...Object.fromEntries(optimisticMessages.map((message) => [message.id, "sending" as MessageSendStatus]))
      }));
      const firstOptimisticMessage = optimisticMessages[0];
      if (firstOptimisticMessage) {
        setConversations((items) => items.map((item) => (item.id === selected.id ? { ...item, preview: mediaPreviewLabel(firstOptimisticMessage), time: formatConversationTime(firstOptimisticMessage.createdAt), latestMessageAt: firstOptimisticMessage.createdAt } : item)));
      }
      setReplyingToMessage(null);
      for (let index = 0; index < filesToSend.length; index += 1) {
        const file = filesToSend[index];
        const album = albums[index];
        const optimisticMessage = optimisticMessages[index];
        if (!file || !optimisticMessage) continue;
        const sent = await sendMediaFile(file, album, selectedMediaVariant, optimisticMessage);
        if (!sent) {
          optimisticMessages.slice(index + 1).forEach(removeOptimisticMediaMessage);
          break;
        }
      }
    }
  }


  function positionStickerActionMenu(sticker: StickerDefinition, clientX: number, clientY: number) {
    const menuWidth = 160;
    const menuHeight = 52;
    setStickerActionMenu({
      sticker,
      x: Math.max(8, Math.min(clientX, window.innerWidth - menuWidth - 8)),
      y: Math.max(8, Math.min(clientY, window.innerHeight - menuHeight - 8)),
      openedAt: Date.now()
    });
  }

  function clearStickerLongPressTimer() {
    if (stickerLongPressTimerRef.current) {
      window.clearTimeout(stickerLongPressTimerRef.current);
      stickerLongPressTimerRef.current = null;
    }
  }

  function handleStickerPointerDown(event: ReactPointerEvent<HTMLElement>, sticker: StickerDefinition) {
    if (event.button !== 0) return;
    clearStickerLongPressTimer();
    stickerLongPressTriggeredRef.current = false;
    const { clientX, clientY } = event;
    stickerLongPressTimerRef.current = window.setTimeout(() => {
      stickerLongPressTimerRef.current = null;
      stickerLongPressTriggeredRef.current = true;
      positionStickerActionMenu(sticker, clientX, clientY);
      navigator.vibrate?.(15);
    }, 520);
  }

  function toggleStickerFavorite(sticker: StickerDefinition) {
    const adding = !favoriteStickerIds.has(sticker.id);
    const mutationVersion = stickerFavoriteMutationVersionRef.current + 1;
    stickerFavoriteMutationVersionRef.current = mutationVersion;
    setFavoriteStickerIds((current) => {
      const next = new Set(current);
      if (adding) next.add(sticker.id);
      else next.delete(sticker.id);
      return next;
    });
    setStickerActionMenu(null);
    setNotice(adding
      ? uiLabel(uiLanguage, { zh: "已收藏表情包", en: "Sticker added to favorites", hi: "स्टिकर पसंदीदा में जोड़ा गया" })
      : uiLabel(uiLanguage, { zh: "已取消收藏", en: "Sticker removed from favorites", hi: "स्टिकर पसंदीदा से हटाया गया" }));
    if (!accessToken) return;
    void apiJson<{ stickerIds: string[] }>(`/favorites/stickers/${encodeURIComponent(sticker.id)}`, accessToken, { method: adding ? "POST" : "DELETE" })
      .then(({ stickerIds }) => {
        if (stickerFavoriteMutationVersionRef.current !== mutationVersion) return;
        const knownStickerIds = new Set(BUILT_IN_STICKERS.map((item) => item.id));
        setFavoriteStickerIds(new Set(stickerIds.filter((stickerId) => knownStickerIds.has(stickerId))));
      })
      .catch(() => {
        if (stickerFavoriteMutationVersionRef.current !== mutationVersion) return;
        setFavoriteStickerIds((current) => {
          const next = new Set(current);
          if (adding) next.delete(sticker.id);
          else next.add(sticker.id);
          return next;
        });
        setNotice(uiLabel(uiLanguage, { zh: "收藏同步失败，请重试", en: "Favorite sync failed. Please try again.", hi: "पसंदीदा सिंक नहीं हुआ। फिर कोशिश करें।" }));
      });
  }

  function sendSticker(sticker: StickerDefinition) {
    if (!currentUser || !selectedExists) return;
    const reply = replyingToMessage;
    const body = encodeStickerMessage(sticker);
    const message: MessagePayload = {
      id: `local-${Date.now()}-${createBrowserId()}`,
      conversationId: selected.id,
      senderId: currentUser.id,
      senderName: currentUser.nickname,
      type: "text",
      body,
      ...(reply
        ? {
            replyToMessageId: reply.id,
            replyToMessageSenderName: reply.senderName,
            replyToMessageType: reply.type,
            replyToMessageBody: reply.body
          }
        : {}),
      sourceLanguage: "auto",
      targetLanguage: translationTargetLanguage,
      createdAt: new Date().toISOString()
    };
    setMessagesByConversation((current) => ({
      ...current,
      [selected.id]: mergeMessages(current[selected.id] ?? [], [message])
    }));
    showLatestMessageAttention(message.id);
    setMessageStatuses((current) => ({ ...current, [message.id]: "sending" }));
    emitMessage(message);
    const preview = sticker.imageUrl
      ? uiLabel(uiLanguage, { zh: "[表情包]", en: "[Sticker]", hi: "[स्टिकर]" })
      : [sticker.emoji, stickerLabel(sticker, uiLanguage)].filter(Boolean).join(" ");
    setConversations((items) => items.map((item) => (item.id === selected.id ? { ...item, preview, time: formatConversationTime(message.createdAt), latestMessageAt: message.createdAt } : item)));
    setStickerPanelOpen(false);
    setComposerMenuOpen(false);
    setReplyingToMessage(null);
  }
  function stopVoiceLevelMonitor() {
    if (voiceAnimationFrameRef.current) {
      window.cancelAnimationFrame(voiceAnimationFrameRef.current);
      voiceAnimationFrameRef.current = null;
    }
    void voiceAudioContextRef.current?.close().catch(() => undefined);
    voiceAudioContextRef.current = null;
    setVoiceLevels(Array(28).fill(0));
  }

  function startVoiceLevelMonitor(stream: MediaStream) {
    stopVoiceLevelMonitor();
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const audioContext = new AudioContextClass();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.78;
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    voiceAudioContextRef.current = audioContext;
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const value of data) {
        const centered = (value - 128) / 128;
        sum += centered * centered;
      }
      const rms = Math.sqrt(sum / data.length);
      const level = Math.min(1, Math.max(0, (rms - 0.018) * 10));
      setVoiceLevels((current) => [...current.slice(1), level < 0.035 ? 0 : level]);
      voiceAnimationFrameRef.current = window.requestAnimationFrame(tick);
    };
    tick();
  }

  async function startVoiceRecording() {
    if (!currentUser || !selectedExists || voiceRecording || mediaUploading) return;
    setVoiceRecording(true);
    setNotice(t.voiceRecording);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!voiceHoldRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        setVoiceRecording(false);
        return;
      }
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      voiceChunksRef.current = [];
      voiceStreamRef.current = stream;
      startVoiceLevelMonitor(stream);
      voiceRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) voiceChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        prepareRecordedVoicePreview();
      };
      recorder.start();
    } catch (error) {
      setNotice(extractErrorMessage(error, t.voiceRecordFailed));
      setVoiceRecording(false);
      stopVoiceLevelMonitor();
      voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
      voiceStreamRef.current = null;
    }
  }

  function stopVoiceRecording() {
    voiceHoldRef.current = false;
    const recorder = voiceRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      setVoiceRecording(false);
      voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
      voiceStreamRef.current = null;
      stopVoiceLevelMonitor();
      return;
    }
    recorder.stop();
    stopVoiceLevelMonitor();
    setVoiceRecording(false);
  }

  function handleVoiceButtonPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    voiceHoldRef.current = true;
    void startVoiceRecording();
  }

  function handleVoiceButtonPointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    stopVoiceRecording();
  }

  function stopSpeechToTextRecording() {
    speechToTextStopRequestedRef.current = true;
    const recorder = speechToTextRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      speechToTextStreamRef.current?.getTracks().forEach((track) => track.stop());
      speechToTextStreamRef.current = null;
      speechToTextRecorderRef.current = null;
      speechToTextStartRef.current = false;
      setSpeechToTextListening(false);
      setNotice(uiLabel(uiLanguage, { zh: "语音转文字已停止。", en: "Speech-to-text stopped.", hi: "वॉइस-टू-टेक्स्ट बंद कर दिया गया।" }));
      return;
    }
    try {
      recorder.stop();
      setNotice(uiLabel(uiLanguage, { zh: "正在整理录音并转换文字…", en: "Preparing the recording for transcription…", hi: "रिकॉर्डिंग को टेक्स्ट में बदला जा रहा है…" }));
    } catch (error) {
      speechToTextRecorderRef.current = null;
      speechToTextStreamRef.current?.getTracks().forEach((track) => track.stop());
      speechToTextStreamRef.current = null;
      speechToTextStartRef.current = false;
      setSpeechToTextListening(false);
      setNotice(extractErrorMessage(error, uiLabel(uiLanguage, { zh: "无法结束语音转文字录音。", en: "Could not stop speech-to-text recording.", hi: "वॉइस-टू-टेक्स्ट रिकॉर्डिंग बंद नहीं हो सकी।" })));
    }
  }

  async function copyMessageText(message: MessagePayload) {
    await copyPlainMessageText(message.body?.trim() ?? "", messageActionLabels[uiLanguage].copiedOriginal);
  }

  async function copyTranslatedMessageText(translated?: string) {
    await copyPlainMessageText(translated?.trim() ?? "", messageActionLabels[uiLanguage].copiedTranslation);
  }

  async function transcribeSpeechToText(file: File) {
    const token = accessTokenRef.current || accessToken;
    if (!token) {
      setNotice(uiLabel(uiLanguage, { zh: "登录状态已失效，请重新登录后使用语音转文字。", en: "Your session expired. Sign in again to use speech-to-text.", hi: "आपका सत्र समाप्त हो गया है। वॉइस-टू-टेक्स्ट के लिए फिर से साइन इन करें।" }));
      return;
    }
    setSpeechToTextLoading(true);
    setNotice(uiLabel(uiLanguage, { zh: "正在转换语音文字…", en: "Converting speech to text…", hi: "आवाज़ को टेक्स्ट में बदला जा रहा है…" }));
    try {
      const dataBase64 = await readFileAsBase64(file);
      const result = await apiJson<{ text?: string }>("/voice/transcribe", token, {
        method: "POST",
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type || "audio/webm",
          size: file.size,
          dataBase64
        })
      });
      const text = typeof result.text === "string" ? result.text.trim() : "";
      if (!text) throw new Error(uiLabel(uiLanguage, { zh: "没有识别到语音内容，请再试一次。", en: "No speech was recognized. Please try again.", hi: "आवाज़ पहचानी नहीं गई। कृपया फिर कोशिश करें।" }));
      setDraft((current) => current + (current && !/\s$/.test(current) ? " " : "") + text);
      window.setTimeout(() => {
        draftTextareaRef.current?.focus();
        resizeDraftTextarea();
      }, 0);
      setNotice(uiLabel(uiLanguage, { zh: "语音转文字完成。", en: "Speech-to-text completed.", hi: "वॉइस-टू-टेक्स्ट पूरा हुआ।" }));
    } catch (error) {
      setNotice(extractErrorMessage(error, uiLabel(uiLanguage, { zh: "语音转文字失败，请稍后重试。", en: "Speech-to-text failed. Please try again later.", hi: "वॉइस-टू-टेक्स्ट विफल हुआ। कृपया बाद में फिर कोशिश करें।" })));
    } finally {
      setSpeechToTextLoading(false);
    }
  }

  async function startSpeechToTextRecording() {
    if (!currentUser || !selectedExists || mediaUploading || speechToTextLoading || speechToTextStartRef.current) return;
    speechToTextStartRef.current = true;
    speechToTextStopRequestedRef.current = false;
    setSpeechToTextListening(true);
    setNotice(uiLabel(uiLanguage, { zh: "正在录音转文字，再次点击按钮结束。", en: "Recording for transcription. Click again to finish.", hi: "टेक्स्ट के लिए रिकॉर्डिंग हो रही है। समाप्त करने के लिए फिर क्लिक करें।" }));
    let stream: MediaStream | null = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        throw new Error(uiLabel(uiLanguage, { zh: "当前浏览器不支持录音转文字。", en: "This browser does not support recording for speech-to-text.", hi: "यह ब्राउज़र वॉइस-टू-टेक्स्ट रिकॉर्डिंग समर्थित नहीं करता।" }));
      }
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (speechToTextStopRequestedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        speechToTextStartRef.current = false;
        setSpeechToTextListening(false);
        return;
      }
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      speechToTextChunksRef.current = [];
      speechToTextStreamRef.current = stream;
      speechToTextRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) speechToTextChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const chunks = speechToTextChunksRef.current;
        speechToTextChunksRef.current = [];
        speechToTextRecorderRef.current = null;
        speechToTextStreamRef.current?.getTracks().forEach((track) => track.stop());
        speechToTextStreamRef.current = null;
        speechToTextStartRef.current = false;
        speechToTextStopRequestedRef.current = false;
        setSpeechToTextListening(false);
        if (!chunks.length) {
          setNotice(uiLabel(uiLanguage, { zh: "没有录到声音，请再试一次。", en: "No audio was recorded. Please try again.", hi: "कोई ऑडियो रिकॉर्ड नहीं हुआ। कृपया फिर कोशिश करें।" }));
          return;
        }
        const audioType = recorder.mimeType || mimeType || "audio/webm";
        const extension = audioType.includes("mp4") || audioType.includes("m4a") ? "m4a" : audioType.includes("ogg") ? "ogg" : audioType.includes("wav") ? "wav" : "webm";
        void transcribeSpeechToText(new File([new Blob(chunks, { type: audioType })], "speech-" + Date.now() + "." + extension, { type: audioType }));
      };
      recorder.start();
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      speechToTextRecorderRef.current = null;
      speechToTextStreamRef.current = null;
      speechToTextStartRef.current = false;
      speechToTextStopRequestedRef.current = false;
      setSpeechToTextListening(false);
      const permissionDenied = error instanceof DOMException && ["NotAllowedError", "PermissionDeniedError"].includes(error.name);
      setNotice(permissionDenied
        ? uiLabel(uiLanguage, { zh: "无法访问麦克风，请允许此站点使用麦克风后重试。", en: "Microphone access was denied. Allow this site to use the microphone and try again.", hi: "माइक्रोफ़ोन अनुमति नहीं मिली। इस साइट को अनुमति देकर फिर कोशिश करें।" })
        : extractErrorMessage(error, uiLabel(uiLanguage, { zh: "无法开始语音转文字录音。", en: "Could not start speech-to-text recording.", hi: "वॉइस-टू-टेक्स्ट रिकॉर्डिंग शुरू नहीं हो सकी।" })));
    }
  }

  function toggleSpeechToText() {
    if (speechToTextListening || speechToTextRecorderRef.current || speechToTextStartRef.current) {
      stopSpeechToTextRecording();
      return;
    }
    void startSpeechToTextRecording();
    return;
  }
  /*
    const activeRecognition = speechRecognitionRef.current;
    if (activeRecognition) {
      speechRecognitionActiveRef.current = false;
      try {
        activeRecognition.stop();
      } catch {
        activeRecognition.abort();
      }
      speechRecognitionRef.current = null;
      setSpeechToTextListening(false);
      setNotice(uiLabel(uiLanguage, { zh: "语音转文字已停止。", en: "Speech-to-text stopped.", hi: "वॉइस-टू-टेक्स्ट बंद कर दिया गया।" }));
      return;
    }
    const speechWindow = window as typeof window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setNotice(uiLabel(uiLanguage, { zh: "当前浏览器不支持语音转文字。", en: "Speech-to-text is not supported by this browser.", hi: "यह ब्राउज़र वॉइस-टू-टेक्स्ट समर्थित नहीं करता।" }));
      return;
    }
    const recognition = new Recognition();
    speechRecognitionActiveRef.current = true;
    speechResultIndexRef.current = 0;
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = uiLanguage === "zh" ? "zh-CN" : uiLanguage === "hi" ? "hi-IN" : "en-US";
    recognition.onstart = () => {
      if (speechRecognitionRef.current !== recognition) return;
      setSpeechToTextListening(true);
      setNotice(uiLabel(uiLanguage, { zh: "正在聆听，请说话…", en: "Listening. Please speak…", hi: "सुन रहा है। कृपया बोलें…" }));
    };
    recognition.onresult = (event) => {
      let text = "";
      const startIndex = Math.max(speechResultIndexRef.current, event.resultIndex ?? 0);
      for (let index = startIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (!result?.isFinal) continue;
        text += result[0]?.transcript ?? "";
      }
      speechResultIndexRef.current = Math.max(speechResultIndexRef.current, event.results.length);
      const normalized = text.trim();
      if (!normalized) return;
      setDraft((current) => `${current}${current && !/\s$/.test(current) ? " " : ""}${normalized}`);
      window.setTimeout(() => { draftTextareaRef.current?.focus(); resizeDraftTextarea(); }, 0);
    };
    recognition.onerror = (event) => {
      const errorName = event.error ?? "";
      const fatal = ["not-allowed", "service-not-allowed", "audio-capture", "language-not-supported", "network"].includes(errorName);
      if (fatal) {
        speechRecognitionActiveRef.current = false;
        setSpeechToTextListening(false);
      }
      const message = errorName === "not-allowed" || errorName === "service-not-allowed"
        ? uiLabel(uiLanguage, { zh: "浏览器没有语音识别权限，请允许此站点使用麦克风后重试。", en: "Speech recognition is not allowed. Allow microphone access for this site and try again.", hi: "वॉइस पहचान की अनुमति नहीं है। इस साइट के लिए माइक्रोफ़ोन अनुमति दें और फिर प्रयास करें।" })
        : errorName === "audio-capture"
          ? uiLabel(uiLanguage, { zh: "没有检测到可用麦克风，请检查系统输入设备。", en: "No usable microphone was found. Check the system input device.", hi: "कोई उपयोगी माइक्रोफ़ोन नहीं मिला। सिस्टम इनपुट डिवाइस जांचें।" })
          : errorName === "no-speech"
            ? uiLabel(uiLanguage, { zh: "没有检测到声音，请继续说话。", en: "No speech was detected. Keep speaking.", hi: "कोई आवाज़ नहीं मिली। बोलते रहें।" })
            : errorName === "network"
              ? uiLabel(uiLanguage, { zh: "语音识别服务连接失败，请检查网络后重试。", en: "The speech recognition service could not be reached. Check the network and try again.", hi: "वॉइस पहचान सेवा से कनेक्शन नहीं हो सका। नेटवर्क जांचें और फिर प्रयास करें।" })
              : uiLabel(uiLanguage, { zh: "语音转文字失败，请检查麦克风权限后重试。", en: "Speech-to-text failed. Check microphone permission and try again.", hi: "वॉइस-टू-टेक्स्ट विफल हुआ। माइक्रोफ़ोन अनुमति जांचें और फिर प्रयास करें।" });
      setNotice(message);
    };
    recognition.onend = () => {
      if (speechRecognitionRef.current !== recognition) return;
      if (!speechRecognitionActiveRef.current) {
        setSpeechToTextListening(false);
        speechRecognitionRef.current = null;
        return;
      }
      window.setTimeout(() => {
        if (!speechRecognitionActiveRef.current || speechRecognitionRef.current !== recognition) return;
        try {
          recognition.start();
        } catch {
          speechRecognitionActiveRef.current = false;
          speechRecognitionRef.current = null;
          setSpeechToTextListening(false);
          setNotice(uiLabel(uiLanguage, { zh: "语音识别已结束，请重新点击按钮开始。", en: "Speech recognition ended. Click the button to start again.", hi: "वॉइस पहचान समाप्त हो गई। फिर शुरू करने के लिए बटन दबाएं।" }));
        }
      }, 150);
    };
    speechRecognitionRef.current = recognition;
    try {
      recognition.start();
      setSpeechToTextListening(true);
    } catch (error) {
      speechRecognitionActiveRef.current = false;
      speechRecognitionRef.current = null;
      setSpeechToTextListening(false);
      setNotice(extractErrorMessage(error, uiLabel(uiLanguage, { zh: "无法启动语音转文字。", en: "Could not start speech-to-text.", hi: "वॉइस-टू-टेक्स्ट शुरू नहीं हो सका।" })));
    }
  }

  */

  function prepareRecordedVoicePreview() {
    const chunks = voiceChunksRef.current;
    voiceChunksRef.current = [];
    stopVoiceLevelMonitor();
    voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
    voiceStreamRef.current = null;
    voiceRecorderRef.current = null;
    if (!chunks.length) return;
    const blob = new Blob(chunks, { type: "audio/webm" });
    const fileName = `voice-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;
    const file = new File([blob], fileName, { type: "audio/webm" });
    const url = URL.createObjectURL(blob);
    setPendingVoicePreview((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return { file, url, name: fileName };
    });
    setNotice(t.voicePreviewReady);
  }

  function cancelPendingVoice() {
    setPendingVoicePreview((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return null;
    });
  }

  function cancelActiveMediaUpload() {
    const controller = mediaUploadAbortControllerRef.current;
    if (!controller) return;
    controller.abort();
    setNotice(uiLabel(uiLanguage, { zh: "正在取消上传…", en: "Cancelling upload…", hi: "अपलोड रद्द किया जा रहा है…" }));
  }

  async function sendPendingVoice() {
    const pending = pendingVoicePreview;
    if (!pending || !currentUser || !selectedExists) return;
    setPendingVoicePreview(null);
    const uploadController = new AbortController();
    mediaUploadAbortControllerRef.current = uploadController;
    setMediaUploading(true);
    setMediaUploadProgress(1);
    setNotice(`${t.uploadingMedia} 1%`);
    try {
      const media = await uploadMediaWithProgress(pending.file, accessToken, (progress) => {
        setMediaUploadProgress(progress);
        setNotice(`${t.uploadingMedia} ${progress}%`);
      }, uploadController.signal);
      const reply = replyingToMessage;
      const message: MessagePayload = {
        id: `local-${Date.now()}-${createBrowserId()}`,
        conversationId: selected.id,
        senderId: currentUser.id,
        senderName: currentUser.nickname,
        type: "audio",
        body: media.fileName,
        mediaUrl: media.url,
        mediaSizeBytes: media.size,
        ...(reply
          ? {
              replyToMessageId: reply.id,
              replyToMessageSenderName: reply.senderName,
              replyToMessageType: reply.type,
              replyToMessageBody: reply.body
            }
          : {}),
        createdAt: new Date().toISOString()
      };
      URL.revokeObjectURL(pending.url);
      setMessagesByConversation((current) => ({
        ...current,
        [selected.id]: mergeMessages(current[selected.id] ?? [], [message])
      }));
      setConversations((items) => items.map((item) => (item.id === selected.id ? { ...item, preview: mediaPreviewLabel(message), time: formatConversationTime(message.createdAt), latestMessageAt: message.createdAt } : item)));
      setReplyingToMessage(null);
      emitMessage(message);
      requestScrollToBottom("smooth");
    } catch (error) {
      if (uploadController.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
        setNotice(uiLabel(uiLanguage, { zh: "已取消上传。", en: "Upload cancelled.", hi: "अपलोड रद्द कर दिया गया।" }));
        setPendingVoicePreview(pending);
        return;
      }
      setNotice(extractErrorMessage(error, t.mediaUploadFailed));
      setPendingVoicePreview(pending);
    } finally {
      if (mediaUploadAbortControllerRef.current === uploadController) mediaUploadAbortControllerRef.current = null;
      setMediaUploading(false);
      setMediaUploadProgress(0);
    }
  }

  function clearMessageLongPressTimer() {
    if (messageLongPressTimerRef.current) {
      window.clearTimeout(messageLongPressTimerRef.current);
      messageLongPressTimerRef.current = null;
    }
  }

  function toggleSelectedMessage(messageId: string) {
    setSelectedMessageIds((current) => {
      const next = new Set(current);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      if (next.size === 0) setMessageSelectMode(false);
      return next;
    });
  }


  async function loadTtsRuntimeConfig(token = accessTokenRef.current || accessToken, showNotice = false): Promise<TtsRuntimeConfig | null> {
    if (!token) return null;
    setTtsConfigLoading(true);
    setTtsConfigNotice("");
    try {
      const config = await apiJson<TtsRuntimeConfig>(`/voice/tts/config?refresh=${Date.now()}`, token);
      setTtsConfig(config);
      setSelectedTtsVoiceType((current) => {
        const activeVoices = config.provider === "aliyun_bailian" ? config.aliyun.voices : config.doubao.voices;
        const configuredVoice = config.provider === "aliyun_bailian" ? config.aliyun.voiceType : config.doubao.voiceType;
        const storedVoice = getStoredTtsVoice(config.provider, currentUserIdRef.current ?? "");
        const preferredVoice = storedVoice || current;
        const hasPreferred = activeVoices.some((item) => item.value === preferredVoice);
        return hasPreferred ? preferredVoice : configuredVoice || activeVoices[0]?.value || "";
      });
      if (showNotice) setTtsConfigNotice(uiLabel(uiLanguage, { zh: "已刷新后台朗读配置。", en: "TTS configuration refreshed.", hi: "TTS कॉन्फ़िगरेशन रीफ़्रेश हुआ।" }));
      return config;
    } catch (error) {
      setTtsConfig({ provider: "loading", doubao: { voiceType: "", voices: [] }, aliyun: { voiceType: "", model: "", voices: [] } });
      if (showNotice) setTtsConfigNotice(extractErrorMessage(error, uiLabel(uiLanguage, { zh: "朗读配置刷新失败。", en: "Could not refresh TTS configuration.", hi: "TTS कॉन्फ़िगरेशन रीफ़्रेश नहीं हुआ।" })));
      return null;
    } finally {
      setTtsConfigLoading(false);
    }
  }
  function beginMessageSelect(messageId: string) {
    setMessageActionMenuId(null);
    setMessageSelectMode(true);
    setSelectedMessageIds((current) => new Set(current).add(messageId));
  }

  function handleMessagePointerDown(event: ReactPointerEvent<HTMLElement>, messageId: string) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const interactiveTarget = event.target instanceof Element ? event.target.closest("button, a, input, textarea, select, video, audio") : null;
    if (interactiveTarget) return;
    clearMessageLongPressTimer();
    messageLongPressTriggeredRef.current = false;
    messageSwipeRef.current = { pointerId: event.pointerId, messageId, startX: event.clientX, startY: event.clientY, offset: 0, swiping: false };
    setMessageSwipeVisual({ messageId, offset: 0, active: true });
    event.currentTarget.setPointerCapture?.(event.pointerId);
    messageLongPressTimerRef.current = window.setTimeout(() => {
      messageLongPressTimerRef.current = null;
      messageLongPressTriggeredRef.current = true;
      if (messageActionDisplayMode === "long-press" || messageActionDisplayMode === "compact") setMessageActionMenuId(messageId);
      else beginMessageSelect(messageId);
    }, 520);
  }
  function selectTtsVoiceType(voiceType: string) {
    ttsPlaybackRunRef.current += 1;
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = null;
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeakingMessageKey("");
    setSelectedTtsVoiceType(voiceType);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        ttsVoiceStorageKey(ttsConfig.provider, currentUserIdRef.current ?? ""),
        voiceType
      );
    }
  }

  function handleMessagePointerMove(event: ReactPointerEvent<HTMLElement>) {
    const gesture = messageSwipeRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) clearMessageLongPressTimer();
    const message = currentMessages.find((item) => item.id === gesture.messageId);
    if (!message || message.revokedAt) return;
    if (dx > 4 && dx > Math.abs(dy) * 1.2) {
      gesture.swiping = true;
      gesture.offset = dx <= 96 ? dx : 96 + (dx - 96) * 0.18;
      setMessageSwipeVisual({ messageId: gesture.messageId, offset: gesture.offset, active: true });
      return;
    }
    if (Math.abs(dy) > Math.abs(dx) * 1.2 || dx <= 0) {
      gesture.swiping = false;
      gesture.offset = 0;
      setMessageSwipeVisual({ messageId: gesture.messageId, offset: 0, active: true });
    }
  }

  function handleMessagePointerEnd(event: ReactPointerEvent<HTMLElement>) {
    clearMessageLongPressTimer();
    const gesture = messageSwipeRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const message = currentMessages.find((item) => item.id === gesture.messageId);
    const shouldReply = Boolean(message && !message.revokedAt && gesture.swiping && gesture.offset >= 56);
    if (gesture.swiping) {
      messageLongPressTriggeredRef.current = true;
      setMessageSwipeVisual({ messageId: gesture.messageId, offset: 0, active: false });
      if (shouldReply && message) {
        startReply(message);
        setNotice(uiLabel(uiLanguage, { zh: "已引用这条消息", en: "Message quoted", hi: "संदेश उद्धृत किया गया" }));
      }
      window.setTimeout(() => {
        setMessageSwipeVisual((current) => current?.messageId === gesture.messageId && !current.active ? null : current);
      }, 220);
    } else {
      setMessageSwipeVisual((current) => current?.messageId === gesture.messageId ? null : current);
    }
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    messageSwipeRef.current = null;
  }

  function cancelMessageSelection() {
    setMessageSelectMode(false);
    setSelectedMessageIds(new Set());
  }

  function selectedMessagesForCurrentConversation() {
    return currentMessages.filter((message) => selectedMessageIds.has(message.id));
  }

  function openForwardMessages(messages: MessagePayload[], mode: "normal" | "merged" = "normal") {
    const eligible = messages.filter((message) => !message.revokedAt);
    if (eligible.length === 0) return;
    setForwardMode(mode);
    setForwardQuery("");
    setForwardMessages(eligible);
  }

  function forwardMessageToConversation(target: Conversation) {
    if (!currentUser || forwardMessages.length === 0) return;
    const now = Date.now();
    const forwardAlbumMedia = forwardMessages.filter((source) => isAlbumMediaMessage(source));
    const forwardAlbumId = forwardAlbumMedia.length > 1 ? "album-forward-" + now + "-" + createBrowserId() : undefined;
    let forwardAlbumIndex = 0;
    const sentMessages = forwardMode === "merged" ? [{
      id: "local-" + now + "-merged-" + createBrowserId(),
      conversationId: target.id,
      senderId: currentUser.id,
      senderName: currentUser.nickname,
      type: "text" as MessagePayload["type"],
      body: forwardMessages.map((source) => [source.senderName ?? source.senderId, formatMessageTime(source.createdAt), mediaPreviewLabel(source)].filter(Boolean).join(" ")).join("\\n\\n"),
      sourceLanguage: "auto" as MessagePayload["sourceLanguage"],
      targetLanguage: translationTargetLanguage,
      createdAt: new Date(now).toISOString()
    }] : forwardMessages.map((source, index): MessagePayload => ({
      id: "local-" + now + "-" + index + "-" + createBrowserId(),
      conversationId: target.id,
      senderId: currentUser.id,
      senderName: currentUser.nickname,
      type: source.type,
      body: source.body,
     mediaUrl: source.mediaUrl,
     thumbnailUrl: source.thumbnailUrl,
     mediaSizeBytes: source.mediaSizeBytes,
     transcript: source.transcript,
      ...(forwardAlbumId && isAlbumMediaMessage(source) ? { albumId: forwardAlbumId, albumIndex: forwardAlbumIndex++, albumSize: forwardAlbumMedia.length } : {}),
     sourceLanguage: source.sourceLanguage ?? "auto",
      targetLanguage: translationTargetLanguage,
      createdAt: new Date(now + index).toISOString()
    }));
    setMessagesByConversation((current) => ({
      ...current,
      [target.id]: mergeMessages(current[target.id] ?? [], sentMessages)
    }));
    for (const message of sentMessages) emitMessage(message);
    const latest = sentMessages[sentMessages.length - 1];
    if (latest) {
      setConversations((items) => items.map((item) => item.id === target.id ? { ...item, preview: mediaPreviewLabel(latest), time: formatConversationTime(latest.createdAt), latestMessageAt: latest.createdAt } : item));
    }
    setForwardMessages([]);
    setForwardQuery("");
    cancelMessageSelection();
    setNotice(uiLabel(uiLanguage, { zh: "消息已转发。", en: "Message forwarded.", hi: "संदेश फ़ॉरवर्ड किया गया।" }));
  }

  async function copySelectedMessagesMerged() {
    const text = selectedMessagesForCurrentConversation()
      .map((message) => [
        `${message.senderName ?? message.senderId} ${formatMessageTime(message.createdAt)}`,
        mediaPreviewLabel(message)
      ].filter(Boolean).join("\\n"))
      .join("\\n\\n");
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      setNotice(messageActionLabels[uiLanguage].copied);
    } catch {
      setNotice(messageActionLabels[uiLanguage].copyFailed);
    }
  }

  function deleteSelectedMessagesLocally() {
    if (selectedMessageIds.size === 0) return;
    setHiddenMessageIds((current) => new Set([...current, ...selectedMessageIds]));
    cancelMessageSelection();
  }

  async function toggleVoiceTranscript(message: MessagePayload) {
    if (message.transcript?.trim()) {
      setVisibleTranscriptIds((current) => {
        const next = new Set(current);
        if (next.has(message.id)) next.delete(message.id);
        else next.add(message.id);
        return next;
      });
      return;
    }
    const token = accessTokenRef.current || accessToken;
    if (!token || voiceTranscriptionLoading[message.id]) return;
    setVoiceTranscriptionLoading((current) => ({ ...current, [message.id]: true }));
    setNotice(uiLabel(uiLanguage, { zh: "正在转写语音...", en: "Transcribing voice...", hi: "आवाज़ का लिखित पाठ बनाया जा रहा है..." }));
    try {
      const data = await apiJson<{ message: MessagePayload }>(
        `/conversations/${encodeURIComponent(message.conversationId)}/messages/${encodeURIComponent(message.id)}/transcribe`,
        token,
        { method: "POST", body: JSON.stringify({ targetLanguage: translationTargetLanguage }) }
      );
      setMessagesByConversation((current) => ({
        ...current,
        [data.message.conversationId]: mergeMessages(current[data.message.conversationId] ?? [], [data.message])
      }));
      setVisibleTranscriptIds((current) => new Set(current).add(data.message.id));
      setNotice(messageActionLabels[uiLanguage].translated);
    } catch (error) {
      setNotice(extractErrorMessage(error, uiLabel(uiLanguage, { zh: "语音转文字失败，请稍后重试。", en: "Voice transcription failed.", hi: "आवाज़ का लिखित पाठ नहीं बन सका। बाद में फिर प्रयास करें।" })));
    } finally {
      setVoiceTranscriptionLoading((current) => ({ ...current, [message.id]: false }));
    }
  }

  function revokeWindowForMessage(message: MessagePayload) {
    if (message.type === "text") return 2 * 60 * 1000;
    if (message.type === "file") return 24 * 60 * 60 * 1000;
    return 60 * 60 * 1000;
  }

  function canRevokeMessage(message: MessagePayload) {
    if (message.revokedAt || message.senderId !== currentUserIdRef.current) return false;
    const createdAt = new Date(message.createdAt).getTime();
    return Number.isFinite(createdAt) && Date.now() - createdAt <= revokeWindowForMessage(message);
  }

  function revokeBatchForMessage(message: MessagePayload) {
    if (!canRevokeMessage(message) || message.type !== "text") return [];
    const createdAt = new Date(message.createdAt).getTime();
    if (!Number.isFinite(createdAt)) return [];
    return (messagesByConversation[message.conversationId] ?? [])
      .filter((item) => item.senderId === currentUserIdRef.current && item.type === "text" && !item.revokedAt)
      .filter((item) => {
        const itemTime = new Date(item.createdAt).getTime();
        return Number.isFinite(itemTime) && Math.abs(itemTime - createdAt) <= 2 * 60 * 1000 && Date.now() - itemTime <= 2 * 60 * 1000;
      })
      .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
  }

  function revokeMessageWithResult(message: MessagePayload) {
    return new Promise<boolean>((resolve) => {
      if (!socketRef.current?.connected) {
        resolve(false);
        return;
      }
      socketRef.current.emit("message:revoke", { conversationId: message.conversationId, messageId: message.id }, (response?: { ok?: boolean; message?: MessagePayload; error?: string }) => {
        if (response?.ok && response.message) {
          applyRevokedMessage(response.message);
          resolve(true);
          return;
        }
        resolve(false);
      });
    });
  }

  async function revokeMessageBatch(message: MessagePayload) {
    const batch = revokeBatchForMessage(message);
    if (batch.length < 2) return;
    if (!socketRef.current?.connected) {
      setNotice(t.disconnected);
      return;
    }
    const results = await Promise.all(batch.map((item) => revokeMessageWithResult(item)));
    const done = results.filter(Boolean).length;
    setNotice(done > 0 ? `${messageActionLabels[uiLanguage].revokeBatchDone} (${done})` : t.revokeFailed);
  }

  function applyRevokedMessage(message: MessagePayload) {
    setMessagesByConversation((current) => ({
      ...current,
      [message.conversationId]: mergeMessages(current[message.conversationId] ?? [], [message])
    }));
  }

  async function revokeMessage(message: MessagePayload) {
    if (!socketRef.current?.connected) {
      setNotice(t.disconnected);
      return;
    }
    const ok = await revokeMessageWithResult(message);
    setNotice(ok ? t.messageRevoked : t.revokeFailed);
  }

  function resizeDraftTextarea(element = draftTextareaRef.current) {
    if (!element) return;
    const minHeight = typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches ? 44 : 48;
    const maxHeight = 7 * 32 + 16;
    element.style.height = "0px";
    const contentHeight = element.scrollHeight;
    const nextHeight = Math.min(maxHeight, Math.max(minHeight, contentHeight));
    element.style.height = `${nextHeight}px`;
    element.style.overflowY = contentHeight > maxHeight ? "auto" : "hidden";
  }

  function applyDeletedMessages(conversationId: string, messageIds: string[]) {
    const deleted = new Set(messageIds);
    setMessagesByConversation((current) => ({
      ...current,
      [conversationId]: (current[conversationId] ?? []).filter((message) => !deleted.has(message.id))
    }));
    setSelectedManagedFileIds((current) => new Set(Array.from(current).filter((id) => !deleted.has(id))));
    setSelectedMessageIds((current) => new Set(Array.from(current).filter((id) => !deleted.has(id))));
    setFavoriteMessageIds((current) => new Set(Array.from(current).filter((id) => !deleted.has(id))));
  }

  function deleteMessagesWithResult(conversationId: string, messageIds: string[]) {
    return new Promise<boolean>((resolve) => {
      if (!socketRef.current?.connected) {
        resolve(false);
        return;
      }
      socketRef.current.emit("message:delete", { conversationId, messageIds }, (response?: { ok?: boolean; messageIds?: string[] }) => {
        if (!response?.ok || !Array.isArray(response.messageIds)) {
          resolve(false);
          return;
        }
        applyDeletedMessages(conversationId, response.messageIds);
        resolve(true);
      });
    });
  }

  async function deleteSelectedManagedFiles() {
    if (!currentUser || managedFileDeleting) return;
    const selectedFiles = sortedMediaLibraryMessages.filter((message) => selectedManagedFileIds.has(message.id));
    if (!selectedFiles.length) return;
    if (selectedFiles.some((message) => message.senderId !== currentUser.id)) {
      setNotice(uiLabel(uiLanguage, { zh: "只能删除自己发送的文件。", en: "You can only delete files that you sent.", hi: "आप केवल अपनी भेजी फ़ाइलें हटा सकते हैं।" }));
      return;
    }
    if (!window.confirm(uiLabel(uiLanguage, { zh: `确定永久删除选中的 ${selectedFiles.length} 个文件及聊天记录吗？`, en: `Permanently delete ${selectedFiles.length} selected file(s) and their chat records?`, hi: `चुनी गई ${selectedFiles.length} फ़ाइलें और उनके चैट रिकॉर्ड स्थायी रूप से हटाएं?` }))) return;
    setManagedFileDeleting(true);
    try {
      const grouped = new Map<string, string[]>();
      selectedFiles.forEach((message) => grouped.set(message.conversationId, [...(grouped.get(message.conversationId) ?? []), message.id]));
      const results = await Promise.all(Array.from(grouped.entries()).map(([conversationId, messageIds]) => deleteMessagesWithResult(conversationId, messageIds)));
      if (results.every(Boolean)) {
        setSelectedManagedFileIds(new Set());
        setNotice(uiLabel(uiLanguage, { zh: "所选文件已删除。", en: "Selected files were deleted.", hi: "चुनी गई फ़ाइलें हटा दी गईं।" }));
      } else {
        setNotice(uiLabel(uiLanguage, { zh: "部分文件删除失败，请重试。", en: "Some files could not be deleted. Try again.", hi: "कुछ फ़ाइलें नहीं हट सकीं। फिर कोशिश करें।" }));
      }
    } finally {
      setManagedFileDeleting(false);
    }
  }

  async function deleteSingleMessage(message: MessagePayload) {
    if (!window.confirm(uiLabel(uiLanguage, { zh: "仅从你的聊天界面删除这条信息？其他人的聊天记录不会改变。", en: "Delete this message only from your view? Other participants keep it.", hi: "यह संदेश केवल अपने दृश्य से हटाएं? दूसरे प्रतिभागियों के पास यह बना रहेगा।" }))) return;
    setHiddenMessageIds((current) => new Set(current).add(message.id));
    setNotice(uiLabel(uiLanguage, { zh: "信息已从你的界面删除，其他人的记录保持不变。", en: "Message removed from your view only.", hi: "संदेश केवल आपके दृश्य से हटाया गया।" }));
    return;
    if (!currentUser || message.senderId !== currentUser?.id) {
      setNotice(uiLabel(uiLanguage, { zh: "只能删除自己发送的信息。", en: "You can only delete messages that you sent.", hi: "आप केवल अपने भेजे संदेश हटा सकते हैं।" }));
      return;
    }
    if (!window.confirm(uiLabel(uiLanguage, { zh: "确定永久删除这条信息吗？", en: "Permanently delete this message?", hi: "इस संदेश को स्थायी रूप से हटाएं?" }))) return;
    const deleted = await deleteMessagesWithResult(message.conversationId, [message.id]);
    setNotice(deleted ? uiLabel(uiLanguage, { zh: "信息已删除。", en: "Message deleted.", hi: "संदेश हटा दिया गया।" }) : uiLabel(uiLanguage, { zh: "删除失败，请重试。", en: "Delete failed. Try again.", hi: "हटाना विफल। फिर कोशिश करें।" }));
  }
  useEffect(() => {
    if (composerInputMode === "keyboard") resizeDraftTextarea();
  }, [draft, composerInputMode]);
  function screenshotSnapshot(includeImage = false): ScreenshotHistoryState {
    const snapshot: ScreenshotHistoryState = {
      selection: screenshotSelection ? { ...screenshotSelection } : null,
      annotations: JSON.parse(JSON.stringify(screenshotAnnotations)) as ScreenshotAnnotation[],
      rotation: screenshotRotation,
      ocrText: screenshotOcrText,
      ocrBlocks: JSON.parse(JSON.stringify(screenshotOcrBlocks)) as ScreenshotOcrBlock[],
      ocrTranslationText: screenshotOcrTranslationText
    };
    if (includeImage) {
      snapshot.source = screenshotSource;
      snapshot.sourceSize = { ...screenshotSourceSize };
    }
    return snapshot;
  }

  function screenshotSnapshotsEqual(left: ScreenshotHistoryState, right: ScreenshotHistoryState) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function pushScreenshotHistory(includeImage = false) {
    setScreenshotUndoStack((current) => [...current, screenshotSnapshot(includeImage)]);
    setScreenshotRedoStack([]);
  }

  function beginScreenshotHistoryGesture() {
    screenshotHistoryGestureRef.current = screenshotSnapshot();
  }

  function finishScreenshotHistoryGesture() {
    const before = screenshotHistoryGestureRef.current;
    screenshotHistoryGestureRef.current = null;
    if (!before) return;
    const after = screenshotSnapshot();
    if (screenshotSnapshotsEqual(before, after)) return;
    setScreenshotUndoStack((current) => [...current, before]);
    setScreenshotRedoStack([]);
  }

  function restoreScreenshotSnapshot(snapshot: ScreenshotHistoryState) {
    setScreenshotSelection(snapshot.selection ? { ...snapshot.selection } : null);
    setScreenshotAnnotations(JSON.parse(JSON.stringify(snapshot.annotations)) as ScreenshotAnnotation[]);
    setScreenshotRotation(snapshot.rotation);
    setScreenshotOcrText(snapshot.ocrText);
    setScreenshotOcrBlocks(JSON.parse(JSON.stringify(snapshot.ocrBlocks)) as ScreenshotOcrBlock[]);
    setScreenshotOcrTranslationText(snapshot.ocrTranslationText);
    if (snapshot.source !== undefined && snapshot.sourceSize) {
      setScreenshotSource(snapshot.source);
      setScreenshotSourceSize({ ...snapshot.sourceSize });
    }
    setScreenshotTextPoint(null);
    setScreenshotTextDraft('');
    setScreenshotTextEditingId(null);
    setScreenshotSelectedAnnotationId(null);
  }

  function screenshotPointInsideSelection(point: ScreenshotPoint) {
    const selection = screenshotSelection;
    return Boolean(selection && selection.width >= 6 && selection.height >= 6
      && point.x >= selection.x
      && point.y >= selection.y
      && point.x <= selection.x + selection.width
      && point.y <= selection.y + selection.height);
  }

  function clampScreenshotPointToSelection(point: ScreenshotPoint) {
    const selection = screenshotSelection;
    if (!selection || selection.width < 6 || selection.height < 6) return point;
    return {
      x: clampNumber(point.x, selection.x, selection.x + selection.width),
      y: clampNumber(point.y, selection.y, selection.y + selection.height)
    };
  }

  function clampScreenshotTextPoint(point: ScreenshotPoint, annotation: ScreenshotTextAnnotation) {
    const selection = screenshotSelection ?? { x: 0, y: 0, width: screenshotSourceSize.width, height: screenshotSourceSize.height };
    const size = screenshotTextBounds({ ...annotation, point: { x: 0, y: 0 } });
    return {
      x: clampNumber(point.x, selection.x, selection.x + Math.max(0, selection.width - size.width)),
      y: clampNumber(point.y, selection.y, selection.y + Math.max(0, selection.height - size.height))
    };
  }

  function screenshotTextAtPoint(point: ScreenshotPoint) {
    for (let index = screenshotAnnotations.length - 1; index >= 0; index -= 1) {
      const annotation = screenshotAnnotations[index];
      if (!annotation || annotation.kind !== 'text') continue;
      const bounds = screenshotTextBounds(annotation);
      if (point.x >= bounds.x - 10 && point.x <= bounds.x + bounds.width + 10 && point.y >= bounds.y - 10 && point.y <= bounds.y + bounds.height + 10) return annotation;
    }
    return null;
  }

  function drawScreenshotCanvas(includeSelectionOverlay = true) {
    const canvas = screenshotCanvasRef.current;
    const image = screenshotImageRef.current;
    const { width, height } = screenshotSourceSize;
    if (!canvas || !image || !width || !height) return;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    drawScreenshotOcrTranslations(context, screenshotOcrBlocks);
    drawScreenshotAnnotations(context, screenshotAnnotations);
    if (includeSelectionOverlay && screenshotSelection && screenshotSelection.width > 0 && screenshotSelection.height > 0) {
      const selection = screenshotSelection;
      context.save();
      context.fillStyle = 'rgba(0, 0, 0, 0.48)';
      context.fillRect(0, 0, width, Math.max(0, selection.y));
      context.fillRect(0, selection.y + selection.height, width, Math.max(0, height - selection.y - selection.height));
      context.fillRect(0, selection.y, Math.max(0, selection.x), selection.height);
      context.fillRect(selection.x + selection.width, selection.y, Math.max(0, width - selection.x - selection.width), selection.height);
      context.setLineDash([]);
      context.lineWidth = Math.max(6, width / 320);
      context.strokeStyle = '#22c55e';
      context.strokeRect(selection.x, selection.y, selection.width, selection.height);
      context.restore();
    }
  }

  function screenshotPointFromClient(clientX: number, clientY: number) {
    const rect = screenshotCanvasRef.current?.getBoundingClientRect();
    const { width, height } = screenshotSourceSize;
    if (!rect || !rect.width || !rect.height || !width || !height) return { x: 0, y: 0 };
    return {
      x: clampNumber((clientX - rect.left) * width / rect.width, 0, width),
      y: clampNumber((clientY - rect.top) * height / rect.height, 0, height)
    };
  }

  function screenshotPointFromEvent(event: ReactPointerEvent<HTMLCanvasElement>) {
    return screenshotPointFromClient(event.clientX, event.clientY);
  }

  function boundedScreenshotSelection(start: ScreenshotPoint, end: ScreenshotPoint) {
    const next = normalizeScreenshotRect(start, end);
    const x = clampNumber(next.x, 0, screenshotSourceSize.width);
    const y = clampNumber(next.y, 0, screenshotSourceSize.height);
    return {
      x,
      y,
      width: Math.min(next.width, Math.max(0, screenshotSourceSize.width - x)),
      height: Math.min(next.height, Math.max(0, screenshotSourceSize.height - y))
    };
  }

  async function requestScreenshotDisplayStream() {
    const preferredOptions = {
      video: { displaySurface: "monitor", cursor: "always" },
      audio: false,
      preferCurrentTab: false,
      selfBrowserSurface: "exclude",
      surfaceSwitching: "exclude",
      monitorTypeSurfaces: "include"
    } as unknown as Parameters<MediaDevices["getDisplayMedia"]>[0];
    try {
      return await navigator.mediaDevices.getDisplayMedia(preferredOptions);
    } catch (error) {
      const errorName = error instanceof DOMException ? error.name : error instanceof Error ? error.name : "";
      if (!["TypeError", "OverconstrainedError", "NotSupportedError"].includes(errorName)) throw error;
      const fallbackOptions = { video: { cursor: "always" }, audio: false } as unknown as Parameters<MediaDevices["getDisplayMedia"]>[0];
      return navigator.mediaDevices.getDisplayMedia(fallbackOptions);
    }
  }

  async function openScreenshotEditor() {
    if (!currentUser || !selectedExists) {
      setNotice(uiLabel(uiLanguage, { zh: '请先打开一个聊天，再使用截图。', en: 'Open a chat before using the screenshot tool.', hi: 'स्क्रीनशॉट के लिए पहले चैट खोलें।' }));
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setNotice(uiLabel(uiLanguage, { zh: '当前浏览器不支持屏幕截图捕获。', en: 'This browser does not support screen capture.', hi: 'यह ब्राउज़र स्क्रीन कैप्चर का समर्थन नहीं करता।' }));
      return;
    }
    let stream: MediaStream | null = null;
    try {
      setScreenshotTool('select');
      setNotice(uiLabel(uiLanguage, { zh: "请在浏览器共享窗口中选择“整个屏幕”，进入后默认会选中整张截图。", en: "In the browser sharing dialog, choose “Entire screen”; the editor will select the full capture by default.", hi: "ब्राउज़र शेयर विंडो में ‘पूरी स्क्रीन’ चुनें; एडिटर डिफ़ॉल्ट रूप से पूरा कैप्चर चुनेगा।" }));
      stream = await requestScreenshotDisplayStream();
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        await new Promise<void>((resolve, reject) => {
          const onReady = () => { cleanup(); resolve(); };
          const onError = () => { cleanup(); reject(new Error('The captured screen has no readable frame.')); };
          const cleanup = () => {
            video.removeEventListener('loadeddata', onReady);
            video.removeEventListener('error', onError);
          };
          video.addEventListener('loadeddata', onReady, { once: true });
          video.addEventListener('error', onError, { once: true });
        });
      }
      const videoWithFrameCallback = video as HTMLVideoElement & { requestVideoFrameCallback?: (callback: () => void) => number };
      if (videoWithFrameCallback.requestVideoFrameCallback) await new Promise<void>((resolve) => videoWithFrameCallback.requestVideoFrameCallback?.(() => resolve()));
      else await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      if (!video.videoWidth || !video.videoHeight) throw new Error('The captured screen has no readable frame.');
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not prepare the screenshot editor.');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const source = canvas.toDataURL('image/png');
      video.pause();
      video.srcObject = null;
      setScreenshotSource(source);
      setScreenshotSourceSize({ width: canvas.width, height: canvas.height });
      setScreenshotSelection({ x: 0, y: 0, width: canvas.width, height: canvas.height });
      setScreenshotAnnotations([]);
      setScreenshotTextPoint(null);
      setScreenshotTextDraft('');
      setScreenshotTextEditingId(null);
      setScreenshotSelectedAnnotationId(null);
      setScreenshotRotation(0);
      setScreenshotRotationBusy(false);
      setScreenshotUndoStack([]);
      setScreenshotRedoStack([]);
      clearScreenshotOcrResults();
      screenshotHistoryGestureRef.current = null;
      setScreenshotEditorOpen(true);
    } catch (error) {
      const cancelled = error instanceof DOMException && (error.name === 'AbortError' || error.name === 'NotAllowedError');
      setNotice(cancelled
        ? uiLabel(uiLanguage, { zh: '已取消截图。', en: 'Screenshot cancelled.', hi: 'स्क्रीनशॉट रद्द किया गया।' })
        : extractErrorMessage(error, uiLabel(uiLanguage, { zh: '截图捕获失败，请重试。', en: 'Could not capture the screen. Please try again.', hi: 'स्क्रीन कैप्चर विफल रहा। फिर कोशिश करें।' })));
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
    }
  }

  function closeScreenshotEditor() {
    if (screenshotOcrBusyRef.current || screenshotOcrLoading || screenshotOcrTranslateLoading) {
      const message = uiLabel(uiLanguage, { zh: "图片 OCR 或翻译仍在处理中，完成前编辑器不会关闭。", en: "Image OCR or translation is still running. The editor will remain open until it finishes.", hi: "इमेज OCR या अनुवाद अभी चल रहा है। पूरा होने तक एडिटर खुला रहेगा।" });
      setScreenshotOcrStatus({ kind: "loading", message });
      setNotice(message);
      return;
    }
    setScreenshotEditorOpen(false);
    setScreenshotSource('');
    setScreenshotSourceSize({ width: 0, height: 0 });
    setScreenshotSelection(null);
    setScreenshotAnnotations([]);
    setScreenshotTextPoint(null);
    setScreenshotTextDraft('');
    setScreenshotTextEditingId(null);
    setScreenshotSelectedAnnotationId(null);
    setScreenshotRotation(0);
    setScreenshotRotationBusy(false);
    setScreenshotUndoStack([]);
    setScreenshotRedoStack([]);
    clearScreenshotOcrResults();
    screenshotImageRef.current = null;
    screenshotGestureRef.current = null;
    screenshotHistoryGestureRef.current = null;
  }

  function selectFullScreenshot(recordHistory = true) {
    const { width, height } = screenshotSourceSize;
    if (!width || !height) return;
    const next = { x: 0, y: 0, width, height };
    const currentSnapshot = screenshotSnapshot();
    if (recordHistory && !screenshotSnapshotsEqual(currentSnapshot, { ...currentSnapshot, selection: next })) pushScreenshotHistory();
    setScreenshotSelection(next);
    setScreenshotTextPoint(null);
    setScreenshotTextDraft('');
    setScreenshotTextEditingId(null);
    setScreenshotSelectedAnnotationId(null);
    setScreenshotTool('select');
  }

  async function rotateScreenshot(degrees: 90 | -90) {
    if (screenshotRotationBusy) return;
    if (screenshotTextPoint) {
      commitScreenshotText();
      return;
    }
    const image = screenshotImageRef.current;
    const { width, height } = screenshotSourceSize;
    if (!image || !width || !height) return;
    setScreenshotRotationBusy(true);
    try {
      const clockwise = degrees > 0;
      const canvas = document.createElement('canvas');
      canvas.width = height;
      canvas.height = width;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not prepare the rotated image.');
      if (clockwise) {
        context.translate(height, 0);
        context.rotate(Math.PI / 2);
      } else {
        context.translate(0, width);
        context.rotate(-Math.PI / 2);
      }
      context.drawImage(image, 0, 0, width, height);
      const nextSource = canvas.toDataURL('image/png');
      const nextSize = { width: height, height: width };
      const nextSelection = screenshotSelection ? rotateScreenshotSelection(screenshotSelection, width, height, clockwise) : null;
      const nextAnnotations = screenshotAnnotations.map((annotation) => rotateScreenshotAnnotation(annotation, width, height, clockwise));
      const nextOcrBlocks = screenshotOcrBlocks.map((block) => rotateScreenshotOcrBlock(block, width, height, clockwise));
      pushScreenshotHistory(true);
      setScreenshotSource(nextSource);
      setScreenshotSourceSize(nextSize);
      setScreenshotSelection(nextSelection);
      setScreenshotAnnotations(nextAnnotations);
      setScreenshotOcrBlocks(nextOcrBlocks);
      setScreenshotRotation((current) => (current + degrees + 360) % 360);
      setScreenshotTextPoint(null);
      setScreenshotTextDraft('');
      setScreenshotTextEditingId(null);
      setScreenshotSelectedAnnotationId(null);
      setScreenshotTool('select');
      screenshotImageRef.current = null;
    } catch (error) {
      setNotice(extractErrorMessage(error, uiLabel(uiLanguage, { zh: '图片旋转失败，请重试。', en: 'Could not rotate the image. Please try again.', hi: 'इमेज घुमाई नहीं जा सकी। फिर प्रयास करें।' })));
    } finally {
      setScreenshotRotationBusy(false);
    }
  }

  function resetScreenshotAnnotations() {
    pushScreenshotHistory();
    setScreenshotAnnotations([]);
    selectFullScreenshot(false);
  }

  function undoScreenshotAnnotation() {
    const previous = screenshotUndoStack[screenshotUndoStack.length - 1];
    if (!previous) return;
    const currentSnapshot = screenshotSnapshot(true);
    setScreenshotRedoStack((current) => [...current, currentSnapshot]);
    setScreenshotUndoStack((current) => current.slice(0, -1));
    restoreScreenshotSnapshot(previous);
  }

  function redoScreenshotAnnotation() {
    const next = screenshotRedoStack[screenshotRedoStack.length - 1];
    if (!next) return;
    const currentSnapshot = screenshotSnapshot(true);
    setScreenshotUndoStack((current) => [...current, currentSnapshot]);
    setScreenshotRedoStack((current) => current.slice(0, -1));
    restoreScreenshotSnapshot(next);
  }

  function handleScreenshotPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!screenshotSourceSize.width || !screenshotSourceSize.height) return;
    const point = screenshotPointFromEvent(event);
    if (screenshotTextPoint) {
      event.preventDefault();
      commitScreenshotText();
      return;
    }
    if (screenshotTool === 'text') {
      if (!screenshotPointInsideSelection(point)) return;
      event.preventDefault();
      const hit = screenshotTextAtPoint(point);
      setScreenshotSelectedAnnotationId(hit?.id ?? null);
      setScreenshotTextEditingId(hit?.id ?? null);
      setScreenshotTextPoint(hit?.point ?? point);
      setScreenshotTextDraft(hit?.text ?? '');
      return;
    }
    event.preventDefault();
    if (screenshotTool !== 'select' && !screenshotPointInsideSelection(point)) {
      setScreenshotSelectedAnnotationId(null);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const textHit = screenshotTool === 'select' ? screenshotTextAtPoint(point) : null;
    if (textHit) {
      beginScreenshotHistoryGesture();
      setScreenshotSelectedAnnotationId(textHit.id);
      screenshotGestureRef.current = {
        pointerId: event.pointerId,
        tool: 'select',
        start: point,
        annotationId: textHit.id,
        mode: 'move-text',
        textOffset: { x: point.x - textHit.point.x, y: point.y - textHit.point.y }
      };
      return;
    }
    setScreenshotSelectedAnnotationId(null);
    const annotationId = `screenshot-${Date.now()}-${createBrowserId()}`;
    beginScreenshotHistoryGesture();
    screenshotGestureRef.current = { pointerId: event.pointerId, tool: screenshotTool, start: point, annotationId, mode: 'draw' };
    if (screenshotTool === 'select') {
      setScreenshotSelection({ x: point.x, y: point.y, width: 0, height: 0 });
      return;
    }
    if (screenshotTool === 'pen') {
      setScreenshotAnnotations((current) => [...current, { id: annotationId, kind: 'pen', points: [point], color: screenshotColor, width: screenshotStrokeWidth, penType: screenshotPenType }]);
      return;
    }
    if (screenshotTool === 'highlight' || screenshotTool === 'mosaic') {
      setScreenshotAnnotations((current) => [...current, { id: annotationId, kind: screenshotTool, points: [point], color: screenshotColor, width: screenshotStrokeWidth }]);
      return;
    }
    setScreenshotAnnotations((current) => [...current, { id: annotationId, kind: screenshotTool, start: point, end: point, color: screenshotColor, width: screenshotStrokeWidth }]);
  }

  function handleScreenshotPointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const gesture = screenshotGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const point = screenshotPointFromEvent(event);
    if (gesture.mode === 'move-text' && gesture.annotationId) {
      setScreenshotAnnotations((current) => current.map((annotation) => {
        if (annotation.id !== gesture.annotationId || annotation.kind !== 'text') return annotation;
        const requested = { x: point.x - (gesture.textOffset?.x ?? 0), y: point.y - (gesture.textOffset?.y ?? 0) };
        return { ...annotation, point: clampScreenshotTextPoint(requested, annotation) };
      }));
      return;
    }
    if (gesture.tool === 'select') {
      setScreenshotSelection(boundedScreenshotSelection(gesture.start, point));
      return;
    }
    if (!gesture.annotationId) return;
    const constrainedPoint = clampScreenshotPointToSelection(point);
    setScreenshotAnnotations((current) => current.map((annotation) => {
      if (annotation.id !== gesture.annotationId) return annotation;
      if (annotation.kind === 'pen' || annotation.kind === 'highlight' || annotation.kind === 'mosaic') return { ...annotation, points: [...annotation.points, constrainedPoint] };
      return { ...annotation, end: constrainedPoint };
    }));
  }

  function handleScreenshotDoubleClick(event: React.MouseEvent<HTMLCanvasElement>) {
    if (!screenshotSourceSize.width || !screenshotSourceSize.height || screenshotTextPoint) return;
    const point = screenshotPointFromClient(event.clientX, event.clientY);
    const hit = screenshotTextAtPoint(point);
    if (!hit) return;
    event.preventDefault();
    setScreenshotSelectedAnnotationId(hit.id);
    setScreenshotTextEditingId(hit.id);
    setScreenshotTextPoint(hit.point);
    setScreenshotTextDraft(hit.text);
    setScreenshotTool('text');
  }

  function handleScreenshotPointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    const gesture = screenshotGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (gesture.tool === 'select' && (!screenshotSelection || screenshotSelection.width < 6 || screenshotSelection.height < 6)) setScreenshotSelection(null);
    screenshotGestureRef.current = null;
    finishScreenshotHistoryGesture();
  }

  function handleScreenshotTextResizeDown(event: ReactPointerEvent<HTMLButtonElement>, annotationId: string) {
    event.preventDefault();
    event.stopPropagation();
    const annotation = screenshotAnnotations.find((item): item is ScreenshotTextAnnotation => item.id === annotationId && item.kind === 'text');
    if (!annotation) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    beginScreenshotHistoryGesture();
    screenshotGestureRef.current = { pointerId: event.pointerId, tool: 'select', start: screenshotPointFromClient(event.clientX, event.clientY), annotationId, mode: 'resize-text', initialWidth: annotation.width };
    setScreenshotSelectedAnnotationId(annotationId);
  }

  function handleScreenshotTextResizeMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const gesture = screenshotGestureRef.current;
    if (!gesture || gesture.mode !== 'resize-text' || gesture.pointerId !== event.pointerId || !gesture.annotationId) return;
    const point = screenshotPointFromClient(event.clientX, event.clientY);
    const delta = ((point.x - gesture.start.x) + (point.y - gesture.start.y)) / 80;
    const nextWidth = clampNumber((gesture.initialWidth ?? 4) + delta, 2, 24);
    setScreenshotAnnotations((current) => current.map((annotation) => {
      if (annotation.id !== gesture.annotationId || annotation.kind !== 'text') return annotation;
      const resized = { ...annotation, width: nextWidth };
      return { ...resized, point: clampScreenshotTextPoint(annotation.point, resized) };
    }));
  }

  function handleScreenshotTextResizeUp(event: ReactPointerEvent<HTMLButtonElement>) {
    const gesture = screenshotGestureRef.current;
    if (!gesture || gesture.mode !== 'resize-text' || gesture.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    screenshotGestureRef.current = null;
    finishScreenshotHistoryGesture();
  }

  function cancelScreenshotTextEdit() {
    setScreenshotTextPoint(null);
    setScreenshotTextDraft('');
    setScreenshotTextEditingId(null);
    setScreenshotTool('select');
  }

  function commitScreenshotText() {
    const text = screenshotTextDraft.trim();
    const point = screenshotTextPoint;
    if (!point) return;
    if (!text) {
      cancelScreenshotTextEdit();
      return;
    }
    const existingId = screenshotTextEditingId;
    const nextId = existingId ?? `screenshot-text-${Date.now()}-${createBrowserId()}`;
    pushScreenshotHistory();
    if (existingId) {
      setScreenshotAnnotations((current) => current.map((annotation) => annotation.id === existingId && annotation.kind === 'text' ? { ...annotation, text: text.slice(0, 240), point: clampScreenshotTextPoint(point, annotation) } : annotation));
    } else {
      const nextText: ScreenshotTextAnnotation = { id: nextId, kind: 'text', point, text: text.slice(0, 240), color: screenshotColor, width: screenshotStrokeWidth };
      setScreenshotAnnotations((current) => [...current, nextText]);
    }
    setScreenshotTextPoint(null);
    setScreenshotTextDraft('');
    setScreenshotTextEditingId(null);
    setScreenshotSelectedAnnotationId(nextId);
    setScreenshotTool('select');
  }

  async function createScreenshotFile(cropToSelection: boolean) {
    const image = screenshotImageRef.current;
    const { width, height } = screenshotSourceSize;
    if (!image || !width || !height) throw new Error('Screenshot is not ready.');
    const crop = cropToSelection && screenshotSelection && screenshotSelection.width >= 6 && screenshotSelection.height >= 6
      ? screenshotSelection
      : { x: 0, y: 0, width, height };
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(crop.width));
    canvas.height = Math.max(1, Math.round(crop.height));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not prepare the screenshot file.');
    context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
    drawScreenshotOcrTranslations(context, screenshotOcrBlocks.map((block) => ({ ...block, x: block.x - crop.x, y: block.y - crop.y })));
    context.save();
    context.translate(-crop.x, -crop.y);
    drawScreenshotAnnotations(context, screenshotAnnotations);
    context.restore();
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Could not export the screenshot.')), 'image/png'));
    return new File([blob], `glimpse-screenshot-${Date.now()}.png`, { type: 'image/png' });
  }

  function clearScreenshotOcrResults() {
    setScreenshotOcrText("");
    setScreenshotOcrBlocks([]);
    setScreenshotOcrTranslationText("");
    setScreenshotOcrStatus(null);
  }

  async function createScreenshotOcrDataUrl() {
    const image = screenshotImageRef.current;
    const { width, height } = screenshotSourceSize;
    if (!image || !width || !height) throw new Error("Image is not ready for OCR.");
    const crop = screenshotSelection && screenshotSelection.width >= 6 && screenshotSelection.height >= 6
      ? screenshotSelection
      : { x: 0, y: 0, width, height };
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(crop.width));
    canvas.height = Math.max(1, Math.round(crop.height));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare the image for OCR.");
    context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
    return { dataBase64: canvas.toDataURL("image/png"), crop };
  }

  function normalizeScreenshotOcrBlocks(raw: unknown, crop: ScreenshotSelection): ScreenshotOcrBlock[] {
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((value, index) => {
      if (!value || typeof value !== "object") return [];
      const item = value as Record<string, unknown>;
      const text = typeof item.text === "string" ? item.text.trim() : "";
      if (!text) return [];
      const numberValue = (candidate: unknown, fallback: number) => {
        const parsed = typeof candidate === "number" ? candidate : typeof candidate === "string" ? Number(candidate) : Number.NaN;
        return Number.isFinite(parsed) ? parsed : fallback;
      };
      const x = clampNumber(numberValue(item.x, 0.03), 0, 0.99);
      const y = clampNumber(numberValue(item.y, 0.04 + index * 0.06), 0, 0.99);
      const width = clampNumber(numberValue(item.width, 0.94), 0.01, 1 - x);
      const height = clampNumber(numberValue(item.height, 0.06), 0.02, 1 - y);
      const translatedText = typeof item.translatedText === "string" ? item.translatedText.trim() : "";
      const colorValue = (candidate: unknown) => typeof candidate === "string" && /^#[0-9a-f]{6}$/i.test(candidate.trim()) ? candidate.trim().toLowerCase() : undefined;
      const fontColor = colorValue(item.fontColor ?? item.textColor);
      const backgroundColor = colorValue(item.backgroundColor ?? item.bgColor);
      const fontWeight = item.fontWeight === "bold" ? "bold" as const : "normal" as const;
      const textAlign = item.textAlign === "center" || item.textAlign === "right" ? item.textAlign : "left" as const;
      return [{
        id: `ocr-${Date.now()}-${index}`,
        text,
        x: crop.x + x * crop.width,
        y: crop.y + y * crop.height,
        width: width * crop.width,
        height: height * crop.height,
        ...(translatedText ? { translatedText } : {}),
        ...(fontColor ? { fontColor } : {}),
        ...(backgroundColor ? { backgroundColor } : {}),
        fontWeight,
        textAlign
      }];
    });
  }

  async function runScreenshotOcr(targetLanguage?: TranslationLanguage) {
    if (!accessToken || screenshotOcrBusyRef.current || screenshotOcrLoading || screenshotOcrTranslateLoading) return;
    screenshotOcrBusyRef.current = true;
    const translating = Boolean(targetLanguage);
    const loadingMessage = translating
      ? uiLabel(uiLanguage, { zh: "正在识别并翻译图片文字，请稍候；处理期间编辑器会保持打开。", en: "Recognizing and translating image text. The editor will stay open while this runs.", hi: "छवि टेक्स्ट पहचाना और अनुवाद किया जा रहा है। इस दौरान एडिटर खुला रहेगा।" })
      : uiLabel(uiLanguage, { zh: "正在识别图片文字，请稍候；处理期间编辑器会保持打开。", en: "Recognizing image text. The editor will stay open while this runs.", hi: "छवि टेक्स्ट पहचाना जा रहा है। इस दौरान एडिटर खुला रहेगा।" });
    setScreenshotOcrStatus({ kind: "loading", message: loadingMessage });
    if (translating) setScreenshotOcrTranslateLoading(true);
    else setScreenshotOcrLoading(true);
    try {
      const { dataBase64, crop } = await createScreenshotOcrDataUrl();
      const result = await apiJson<{ text?: unknown; blocks?: unknown; targetLanguage?: unknown }>("/ocr/image", accessToken, {
        method: "POST",
        body: JSON.stringify({ dataBase64, mimeType: "image/png", ...(targetLanguage ? { targetLanguage } : {}) })
      }, 320000);
      const text = typeof result.text === "string" ? result.text.trim() : "";
      if (!text) throw new Error(uiLabel(uiLanguage, { zh: "图片中没有识别到文字。", en: "No readable text was found in the image.", hi: "छवि में पढ़ने योग्य टेक्स्ट नहीं मिला।" }));
      let blocks = normalizeScreenshotOcrBlocks(result.blocks, crop);
      if (blocks.length === 0) blocks = [{ id: `ocr-${Date.now()}-fallback`, text, x: crop.x + crop.width * 0.03, y: crop.y + crop.height * 0.03, width: crop.width * 0.94, height: Math.max(24, crop.height * 0.12) }];
      setScreenshotOcrText(text);
      setScreenshotOcrBlocks(blocks);
      if (targetLanguage) {
        const translatedText = blocks.map((block) => block.translatedText ?? "").filter(Boolean).join("\n").trim();
        if (!translatedText) throw new Error(uiLabel(uiLanguage, { zh: "图片文字已识别，但没有返回译文。", en: "The image text was recognized, but no translation was returned.", hi: "छवि का टेक्स्ट पहचाना गया, लेकिन अनुवाद नहीं मिला।" }));
        setScreenshotOcrTranslationText(translatedText);
        const successMessage = uiLabel(uiLanguage, { zh: "图片文字翻译完成，译文已显示在原图对应位置。", en: "Image text translation finished and is shown at the matching positions.", hi: "छवि टेक्स्ट अनुवाद पूरा हुआ और सही स्थानों पर दिख रहा है।" });
        setScreenshotOcrStatus({ kind: "success", message: successMessage });
        setNotice(successMessage);
      } else {
        setScreenshotOcrTranslationText("");
        const successMessage = uiLabel(uiLanguage, { zh: "图片 OCR 完成，识别文字已显示在原图对应位置。", en: "Image OCR finished. Recognized text is shown at the matching positions.", hi: "इमेज OCR पूरा हुआ। पहचाना गया टेक्स्ट सही स्थानों पर दिख रहा है।" });
        setScreenshotOcrStatus({ kind: "success", message: successMessage });
        setNotice(successMessage);
      }
    } catch (error) {
      const errorMessage = extractErrorMessage(error, translating
        ? uiLabel(uiLanguage, { zh: "图片文字翻译失败，请检查模型配置或网络。", en: "Image text translation failed. Check the model configuration or network.", hi: "छवि टेक्स्ट अनुवाद विफल हुआ। मॉडल या नेटवर्क जांचें।" })
        : uiLabel(uiLanguage, { zh: "图片 OCR 失败，请检查 OCR 配置或网络。", en: "Image OCR failed. Check the OCR configuration or network.", hi: "इमेज OCR विफल हुआ। OCR कॉन्फ़िगरेशन या नेटवर्क जांचें।" }));
      setScreenshotOcrStatus({ kind: "error", message: errorMessage });
      setNotice(errorMessage);
    } finally {
      screenshotOcrBusyRef.current = false;
      if (translating) setScreenshotOcrTranslateLoading(false);
      else setScreenshotOcrLoading(false);
    }
  }

  async function copyScreenshotOcrText(translation = false) {
    const text = (translation ? screenshotOcrTranslationText : screenshotOcrText).trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setNotice(uiLabel(uiLanguage, { zh: translation ? "图片译文已复制。" : "OCR 结果已复制。", en: translation ? "Image translation copied." : "OCR result copied.", hi: translation ? "छवि अनुवाद कॉपी हो गया।" : "OCR परिणाम कॉपी हो गया।" }));
    } catch (error) {
      setNotice(extractErrorMessage(error, uiLabel(uiLanguage, { zh: translation ? "图片译文复制失败。" : "OCR 结果复制失败。", en: translation ? "Could not copy the image translation." : "Could not copy the OCR result.", hi: translation ? "छवि अनुवाद कॉपी नहीं हुआ।" : "OCR परिणाम कॉपी नहीं हुआ।" })));
    }
  }

  async function copyScreenshot() {
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('Clipboard image writing is unavailable.');
      const file = await createScreenshotFile(Boolean(screenshotSelection));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': file })]);
      setNotice(uiLabel(uiLanguage, { zh: '截图已复制到剪贴板。', en: 'Screenshot copied to the clipboard.', hi: 'स्क्रीनशॉट क्लिपबोर्ड पर कॉपी हो गया।' }));
    } catch (error) {
      setNotice(extractErrorMessage(error, uiLabel(uiLanguage, { zh: '截图复制失败，请检查浏览器权限。', en: 'Could not copy the screenshot. Check browser permissions.', hi: 'स्क्रीनशॉट कॉपी नहीं हुआ। ब्राउज़र अनुमति जांचें।' })));
    }
  }

  async function downloadScreenshot() {
    try {
      const file = await createScreenshotFile(Boolean(screenshotSelection));
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error) {
      setNotice(extractErrorMessage(error, t.mediaUploadFailed));
    }
  }

  async function sendScreenshot() {
    if (mediaUploading) return;
    try {
      const file = await createScreenshotFile(Boolean(screenshotSelection));
      const sent = await sendMediaFile(file, undefined, "original");
      if (sent) closeScreenshotEditor();
    } catch (error) {
      setNotice(extractErrorMessage(error, t.mediaUploadFailed));
    }
  }

  function createOptimisticMediaMessage(file: File, album?: MediaAlbumContext): MessagePayload {
    const mediaType = mediaTypeFromFile(file);
    const localUrl = URL.createObjectURL(file);
    return {
      id: `local-${Date.now()}-${createBrowserId()}`,
      conversationId: selected.id,
      senderId: currentUser!.id,
      senderName: currentUser!.nickname,
      type: mediaType,
      body: file.name,
      mediaUrl: localUrl,
      mediaSizeBytes: file.size,
      ...(mediaType === "image" ? { thumbnailUrl: localUrl } : {}),
      ...(album ? { albumId: album.id, albumIndex: album.index, albumSize: album.size } : {}),
      createdAt: new Date().toISOString()
    };
  }

  function addOptimisticMediaMessage(message: MessagePayload) {
    setMessagesByConversation((current) => ({
      ...current,
      [message.conversationId]: mergeMessages(current[message.conversationId] ?? [], [message])
    }));
    showLatestMessageAttention(message.id);
    setMessageStatuses((current) => ({ ...current, [message.id]: "sending" }));
  }

  function removeOptimisticMediaMessage(message: MessagePayload) {
    setMessagesByConversation((current) => ({
      ...current,
      [message.conversationId]: (current[message.conversationId] ?? []).filter((item) => item.id !== message.id)
    }));
    setMessageStatuses((current) => {
      const next = { ...current };
      delete next[message.id];
      return next;
    });
    releaseOptimisticMediaPreview(message);
  }

  function releaseOptimisticMediaPreview(message: MessagePayload) {
    const urls = [message.mediaUrl, message.thumbnailUrl].filter((url, index, items): url is string => Boolean(url?.startsWith("blob:")) && items.indexOf(url) === index);
    urls.forEach((url) => URL.revokeObjectURL(url));
  }

  async function sendMediaFile(file: File, album?: MediaAlbumContext, variant: MediaSendVariant = mediaSendVariant, optimisticMessage?: MessagePayload): Promise<boolean> {
    if (!currentUser || !selectedExists || mediaUploading) return false;
    const mediaType = mediaTypeFromFile(file);
    const isImage = mediaType === "image";
    const isVideo = mediaType === "video";
    const maxBytes = mediaType === "image" ? MEDIA_LIMITS.imageMaxBytes : mediaType === "video" ? MEDIA_LIMITS.videoMaxBytes : mediaType === "audio" ? MEDIA_LIMITS.audioMaxBytes : MEDIA_LIMITS.fileMaxBytes;
    if (file.size > maxBytes) {
      if (optimisticMessage) removeOptimisticMediaMessage(optimisticMessage);
      setNotice(t.mediaTooLarge);
      return false;
    }
    const uploadController = new AbortController();
    mediaUploadAbortControllerRef.current = uploadController;
    const localMessage = optimisticMessage ?? createOptimisticMediaMessage(file, album);
    if (!optimisticMessage) addOptimisticMediaMessage(localMessage);
    setMediaUploading(true);
    setFailedMediaFile(null);
    setMediaUploadProgress(1);
    setNotice(`${t.uploadingMedia} 1%`);
    try {
      const reply = replyingToMessage;
      const previewImageFile = variant === "preview" && isImage ? await createImagePreview(file) : null;
      if (uploadController.signal.aborted) throw mediaUploadAbortError();
      let compressedVideoFile: File | null = null;
      if (variant === "preview" && isVideo) {
        setNotice(uiLabel(uiLanguage, { zh: "正在压缩视频，请稍候…", en: "Compressing video, please wait…", hi: "वीडियो संपीड़ित हो रहा है…" }));
        const candidate = await createCompressedVideo(file);
        if (uploadController.signal.aborted) throw mediaUploadAbortError();
        if (candidate && candidate.size < file.size) {
          compressedVideoFile = candidate;
        } else if (!candidate) {
          setNotice(uiLabel(uiLanguage, { zh: "当前浏览器无法完成视频压缩，将使用原视频保证可播放。", en: "This browser could not compress the video; the original will be kept for playback.", hi: "इस ब्राउज़र में वीडियो संपीड़न उपलब्ध नहीं है; चलाने योग्य रखने के लिए मूल वीडियो रखा जाएगा।" }));
        }
      }
      const uploadFile = variant === "preview"
        ? previewImageFile ?? compressedVideoFile ?? file
        : file;
      const media = await uploadMediaWithProgress(uploadFile, accessToken, (progress) => {
        setMediaUploadProgress(progress);
        setNotice(`${t.uploadingMedia} ${progress}%`);
      }, uploadController.signal);
      let thumbnailUrl: string | undefined;
      if (isImage) {
        const thumbnailFile = await createImageThumbnail(file);
        if (thumbnailFile) {
          const thumbnail = await uploadMediaWithProgress(thumbnailFile, accessToken, () => undefined, uploadController.signal);
          thumbnailUrl = thumbnail.url;
        }
      } else if (isVideo) {
        const thumbnailFile = await createVideoThumbnail(file) || (uploadFile !== file ? await createVideoThumbnail(uploadFile) : null);
        if (thumbnailFile) {
          const thumbnail = await uploadMediaWithProgress(thumbnailFile, accessToken, () => undefined, uploadController.signal);
          thumbnailUrl = thumbnail.url;
        }
      }
      const message: MessagePayload = {
        id: localMessage.id,
        conversationId: selected.id,
        senderId: currentUser.id,
        senderName: currentUser.nickname,
        type: media.kind,
        body: compressedVideoFile?.name ?? file.name,
        ...(reply
          ? {
              replyToMessageId: reply.id,
              replyToMessageSenderName: reply.senderName,
              replyToMessageType: reply.type,
              replyToMessageBody: reply.body
            }
          : {}),
        mediaUrl: media.url,
        thumbnailUrl,
        mediaSizeBytes: media.size,
        ...(album ? { albumId: album.id, albumIndex: album.index, albumSize: album.size } : {}),
        createdAt: localMessage.createdAt
      };
      setMessagesByConversation((current) => ({
        ...current,
        [selected.id]: mergeMessages(current[selected.id] ?? [], [message])
      }));
      // Keep the local Blob alive until React has committed the server-backed
      // message. Revoking it first leaves a short window where an immediate
      // click targets an already-invalid download URL.
      if (typeof window !== "undefined") {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => releaseOptimisticMediaPreview(localMessage));
        });
      } else {
        releaseOptimisticMediaPreview(localMessage);
      }
      showLatestMessageAttention(message.id);
      setMessageStatuses((current) => ({ ...current, [message.id]: "sending" }));
      emitMessage(message);
      setConversations((items) => items.map((item) => (item.id === selected.id ? { ...item, preview: mediaPreviewLabel(message), time: formatConversationTime(message.createdAt), latestMessageAt: message.createdAt } : item)));
      setNotice(t.sent);
      setReplyingToMessage(null);
      return true;
    } catch (error) {
      removeOptimisticMediaMessage(localMessage);
      if (uploadController.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
        setNotice(uiLabel(uiLanguage, { zh: "已取消上传。", en: "Upload cancelled.", hi: "अपलोड रद्द कर दिया गया।" }));
        return false;
      }
      setFailedMediaFile(file);
      setNotice(extractErrorMessage(error, t.mediaUploadFailed));
      return false;
    } finally {
      if (mediaUploadAbortControllerRef.current === uploadController) mediaUploadAbortControllerRef.current = null;
      setMediaUploading(false);
      setMediaUploadProgress(0);
    }
  }

  function handleMediaInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length) stageFilesFromClipboard(files);
  }


  function stageFilesFromClipboard(files: File[]) {
    if (!files.length) return;
    setPendingComposerFiles((current) => {
      const remaining = Math.max(99 - current.length, 0);
      const accepted = files.slice(0, remaining);
      const next = [...current, ...accepted];
      if (files.length > accepted.length) {
        setNotice(uiLabel(uiLanguage, { zh: "每次最多选择 99 个文件，超出的文件未加入待发送区。", en: "You can select up to 99 files each time. Extra files were not added.", hi: "एक बार में अधिकतम 99 फाइलें चुनी जा सकती हैं। अतिरिक्त फाइलें नहीं जोड़ी गईं।" }));
      } else {
        setNotice(t.pasteFileReady);
      }
      return next;
    });
  }
  function normalizeContactTags(input: string[] | string) {
    const raw = Array.isArray(input) ? input : input.split(/[,#，、\s]+/);
    const tags: string[] = [];
    const seen = new Set<string>();
    for (const value of raw) {
      const label = value.trim().replace(/^#+/, "").slice(0, 40);
      const key = label.toLocaleLowerCase();
      if (!label || seen.has(key)) continue;
      seen.add(key);
      tags.push(label);
      if (tags.length >= 20) break;
    }
    return tags;
  }
  async function saveContactTags(userId: string, nextTags?: string[]) {
    if (!accessToken || userId === currentUser?.id) return;
    const tags = normalizeContactTags(nextTags ?? [...(contactTags[userId] ?? []), contactTagDraft]);
    setContactTagsSavingId(userId);
    try {
      const result = await apiJson<{ tags: { userId: string; tags: string[] } }>(`/contacts/${encodeURIComponent(userId)}/tags`, accessToken, {
        method: "PUT",
        body: JSON.stringify({ tags })
      });
      setContactTags((current) => ({ ...current, [userId]: result.tags.tags }));
      setContactTagDraft("");
      setNotice(uiLabel(uiLanguage, { zh: "联系人标签已保存", en: "Contact tags saved", hi: "संपर्क टैग सहेजे गए" }));
    } catch (error) {
      setNotice(extractErrorMessage(error, uiLabel(uiLanguage, { zh: "联系人标签保存失败", en: "Could not save contact tags", hi: "संपर्क टैग सहेजे नहीं जा सके" })));
    } finally {
      setContactTagsSavingId("");
    }
  }

  async function toggleStarredContact(userId: string) {
    const currentTags = contactTags[userId] ?? [];
    const starred = currentTags.includes(STARRED_CONTACT_TAG);
    await saveContactTags(userId, starred ? currentTags.filter((tag) => tag !== STARRED_CONTACT_TAG) : [STARRED_CONTACT_TAG, ...currentTags]);
    setContactActionMenu(null);
  }

  function openContactActionMenu(event: React.MouseEvent, userId: string) {
    event.preventDefault();
    event.stopPropagation();
    const width = 176;
    const height = 62;
    setContactActionMenu({
      userId,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - width - 8)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - height - 8))
    });
  }

  async function handleContactMemoImageInput(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []).filter((file) => file.type.startsWith("image/") || mediaTypeFromFile(file) === "image");
    input.value = "";
    if (!files.length) return;
    const remaining = Math.max(0, 3 - contactMemoImagesDraft.length);
    if (remaining === 0) {
      setNotice(uiLabel(uiLanguage, { zh: "联系人备忘最多上传 3 张图片。", en: "A contact memo can contain up to 3 images.", hi: "संपर्क नोट में अधिकतम 3 चित्र हो सकते हैं।" }));
      return;
    }
    if (files.length > remaining) {
      setNotice(uiLabel(uiLanguage, { zh: "联系人备忘最多保留 3 张图片，超出的图片未加入。", en: "Only 3 contact memo images are kept. Extra images were not added.", hi: "संपर्क नोट में केवल 3 चित्र रखे जाते हैं। अतिरिक्त चित्र नहीं जोड़े गए।" }));
    }
    setContactMemoImageLoading(true);
    try {
      const images: string[] = [];
      for (const file of files.slice(0, remaining)) {
        if (file.size > 20 * 1024 * 1024) continue;
        const preview = await createImagePreview(file);
        const source = preview ?? file;
        const dataUrl = await readFileAsBase64(source);
        if (dataUrl) images.push(dataUrl);
      }
      setContactMemoImagesDraft((current) => [...current, ...images].slice(0, 3));
      if (!images.length) setNotice(uiLabel(uiLanguage, { zh: "图片读取失败，请重新选择。", en: "The images could not be read. Please choose them again.", hi: "चित्र पढ़े नहीं जा सके। उन्हें फिर चुनें।" }));
    } catch {
      setNotice(uiLabel(uiLanguage, { zh: "图片读取失败，请重新选择。", en: "The images could not be read. Please choose them again.", hi: "चित्र पढ़े नहीं जा सके। उन्हें फिर चुनें।" }));
    } finally {
      setContactMemoImageLoading(false);
    }
  }

  function removeContactMemoImage(index: number) {
    setContactMemoImagesDraft((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  async function saveContactMemo(userId: string) {
    if (!accessToken || !userId || userId === currentUser?.id) return;
    const body = contactMemoDraft.trim().slice(0, 2000);
    const images = contactMemoImagesDraft.slice(0, 3);
    setContactMemoSavingId(userId);
    try {
      const result = await apiJson<{ memo: ContactMemoApiRecord }>(`/contacts/${encodeURIComponent(userId)}/memo`, accessToken, {
        method: "PUT",
        body: JSON.stringify({ body, images })
      });
      const savedBody = typeof result.memo?.body === "string" ? result.memo.body : "";
      const savedImages = Array.isArray(result.memo?.images) ? result.memo.images.filter((image): image is string => typeof image === "string").slice(0, 3) : [];
      setContactMemos((current) => {
        const next = { ...current };
        if (savedBody) next[userId] = savedBody;
        else delete next[userId];
        return next;
      });
      setContactMemoImages((current) => {
        const next = { ...current };
        if (savedImages.length) next[userId] = savedImages;
        else delete next[userId];
        return next;
      });
      setNotice(uiLabel(uiLanguage, { zh: "联系人备忘已保存", en: "Contact memo saved to your account", hi: "संपर्क नोट आपके खाते में सहेजा गया" }));
    } catch (error) {
      setNotice(extractErrorMessage(error, uiLabel(uiLanguage, { zh: "联系人备忘保存失败", en: "Could not save contact memo", hi: "संपर्क नोट सहेजा नहीं जा सका" })));
    } finally {
      setContactMemoSavingId("");
    }
  }

  function handleComposerPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData.files ?? []).filter((file) => file.size > 0);
    if (files.length > 0) {
      event.preventDefault();
      stageFilesFromClipboard(files);
    }
  }

  function insertComposerLineBreak(event: KeyboardEvent<HTMLTextAreaElement>) {
    const textarea = event.currentTarget;
    const value = textarea.value;
    const start = textarea.selectionStart ?? value.length;
    const end = textarea.selectionEnd ?? start;
    const nextValue = `${value.slice(0, start)}\n${value.slice(end)}`;
    const nextCursor = start + 1;
    event.preventDefault();
    setDraft(nextValue);
    setMentionPickerOpen(mentionTokenIsActive(nextValue, nextCursor));
    if (nextValue.trim()) {
      setComposerMenuOpen(false);
      emitTyping();
    }
    window.requestAnimationFrame(() => {
      const current = draftTextareaRef.current;
      if (!current) return;
      current.focus();
      current.setSelectionRange(nextCursor, nextCursor);
      resizeDraftTextarea(current);
    });
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape" && mentionPickerOpen) {
      event.preventDefault();
      setMentionPickerOpen(false);
      return;
    }
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    if (isMobileComposerDevice) return;
    const plainEnter = !event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey;
    const ctrlEnter = event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey;
    const shouldSend = sendWithEnter ? plainEnter : ctrlEnter;
    const shouldInsertLineBreak = sendWithEnter ? ctrlEnter : plainEnter;
    if (shouldSend) {
      event.preventDefault();
      void sendMessage(event as unknown as FormEvent);
      return;
    }
    if (shouldInsertLineBreak) insertComposerLineBreak(event);
  }

  function mentionStartIndex(value: string, cursor: number) {
    const before = value.slice(0, Math.max(0, cursor));
    const atIndex = before.lastIndexOf("@");
    if (atIndex < 0) return -1;
    const token = before.slice(atIndex + 1);
    if (/[\s\u3000@]/.test(token)) return -1;
    const previous = before[atIndex - 1] ?? "";
    if (previous && /[A-Za-z0-9_]/.test(previous)) return -1;
    return atIndex;
  }

  function mentionTokenIsActive(value: string, cursor: number) {
    if (selected.type !== "group") return false;
    return mentionStartIndex(value, cursor) >= 0;
  }

  function syncMentionPicker(textarea: HTMLTextAreaElement | null = draftTextareaRef.current) {
    if (!textarea) return;
    const cursor = textarea.selectionStart ?? textarea.value.length;
    setMentionPickerOpen(mentionTokenIsActive(textarea.value, cursor));
  }

  function handleDraftChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = event.currentTarget.value;
    const cursor = event.currentTarget.selectionStart ?? value.length;
    setDraft(value);
    setMentionPickerOpen(mentionTokenIsActive(value, cursor));
    if (value.trim()) {
      setComposerMenuOpen(false);
      emitTyping();
    }
    resizeDraftTextarea(event.currentTarget);
  }

  function insertMention(user: SearchUser) {
    const name = displayUserName(user);
    const textarea = draftTextareaRef.current;
    const current = draft;
    const cursorStart = textarea?.selectionStart ?? current.length;
    const cursorEnd = textarea?.selectionEnd ?? cursorStart;
    const before = current.slice(0, cursorStart);
    const after = current.slice(cursorEnd);
    const activeMentionStart = mentionStartIndex(current, cursorStart);
    const hasActiveMention = activeMentionStart >= 0 && activeMentionStart < cursorStart && current[activeMentionStart] === "@";
    const mentionStart = hasActiveMention ? activeMentionStart : cursorStart;
    const beforeMention = before.slice(0, mentionStart);
    const prefix = !hasActiveMention && beforeMention && !/[\s\u3000]$/.test(beforeMention) ? `${beforeMention} ` : beforeMention;
    const mentionText = `@${name} `;
    const nextDraft = `${prefix}${mentionText}${after}`;
    const nextCursor = prefix.length + mentionText.length;
    setDraft(nextDraft);
    setMentionPickerOpen(false);
    if (nextDraft.trim()) emitTyping();
    window.setTimeout(() => {
      draftTextareaRef.current?.focus();
      draftTextareaRef.current?.setSelectionRange(nextCursor, nextCursor);
      resizeDraftTextarea();
    }, 0);
  }

  function emitTyping() {
    if (!socketRef.current?.connected || !selectedExists || !currentUser) return;
    socketRef.current.emit("typing", { conversationId: selected.id, userId: currentUser.id, name: currentUser.nickname });
  }




  async function createCroppedAvatarFile(source: string) {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(t.mediaUploadFailed));
      img.src = source;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    if (!context) throw new Error(t.mediaUploadFailed);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, 512, 512);

    const viewportSize = avatarCropFrameRef.current?.clientWidth || avatarCropFrameSize || 320;
    const baseScale = Math.max(viewportSize / image.naturalWidth, viewportSize / image.naturalHeight);
    const renderScale = baseScale * avatarCropScale;
    const cropSize = viewportSize / renderScale;
    const boundedOffset = clampAvatarCropOffset(avatarCropOffset, avatarCropScale, { width: image.naturalWidth, height: image.naturalHeight }, viewportSize);
    const centerX = image.naturalWidth / 2 - boundedOffset.x / renderScale;
    const centerY = image.naturalHeight / 2 - boundedOffset.y / renderScale;
    const sx = clampNumber(centerX - cropSize / 2, 0, Math.max(0, image.naturalWidth - cropSize));
    const sy = clampNumber(centerY - cropSize / 2, 0, Math.max(0, image.naturalHeight - cropSize));

    context.drawImage(image, sx, sy, cropSize, cropSize, 0, 0, 512, 512);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error(t.mediaUploadFailed)), "image/webp", 0.9));
    return new File([blob], "avatar.webp", { type: "image/webp" });
  }

  async function confirmAvatarCrop() {
    if (!avatarCropSource) return;
    try {
      const file = await createCroppedAvatarFile(avatarCropSource);
      const target = avatarCropTarget;
      setAvatarCropSource("");
      if (target === "group") await uploadSelectedGroupAvatar(file);
      else await handleAvatarFile(file);
    } catch (error) {
      const message = extractErrorMessage(error, t.mediaUploadFailed);
      if (avatarCropTarget === "group") setGroupError(message);
      else setNotice(message);
    }
  }

  function updateAvatarCrop(nextOffset: AvatarCropOffset, nextScale = avatarCropScale) {
    const viewportSize = avatarCropFrameRef.current?.clientWidth || avatarCropFrameSize || 320;
    const boundedScale = clampNumber(nextScale, 1, 4);
    setAvatarCropScale(boundedScale);
    setAvatarCropOffset(clampAvatarCropOffset(nextOffset, boundedScale, avatarCropImageSize, viewportSize));
  }

  function handleAvatarCropPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setAvatarCropFrameSize(event.currentTarget.clientWidth || 320);
    const gesture = avatarCropGestureRef.current;
    gesture.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = Array.from(gesture.pointers.values());
    gesture.lastCenter = points.length >= 2 ? midpointBetweenPoints(points[0]!, points[1]!) : { x: event.clientX, y: event.clientY };
    gesture.lastDistance = points.length >= 2 ? distanceBetweenPoints(points[0]!, points[1]!) : null;
  }

  function handleAvatarCropPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const gesture = avatarCropGestureRef.current;
    if (!gesture.pointers.has(event.pointerId)) return;
    event.preventDefault();
    gesture.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = Array.from(gesture.pointers.values());
    const center = points.length >= 2 ? midpointBetweenPoints(points[0]!, points[1]!) : { x: event.clientX, y: event.clientY };
    const previousCenter = gesture.lastCenter ?? center;
    const delta = { x: center.x - previousCenter.x, y: center.y - previousCenter.y };
    let nextScale = avatarCropScale;
    if (points.length >= 2) {
      const distance = distanceBetweenPoints(points[0]!, points[1]!);
      if (gesture.lastDistance && gesture.lastDistance > 0) nextScale = clampNumber(avatarCropScale * (distance / gesture.lastDistance), 1, 4);
      gesture.lastDistance = distance;
    }
    updateAvatarCrop({ x: avatarCropOffset.x + delta.x, y: avatarCropOffset.y + delta.y }, nextScale);
    gesture.lastCenter = center;
  }

  function handleAvatarCropPointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    const gesture = avatarCropGestureRef.current;
    gesture.pointers.delete(event.pointerId);
    const points = Array.from(gesture.pointers.values());
    gesture.lastCenter = points.length >= 2 ? midpointBetweenPoints(points[0]!, points[1]!) : points[0] ?? null;
    gesture.lastDistance = points.length >= 2 ? distanceBetweenPoints(points[0]!, points[1]!) : null;
  }

  function handleAvatarCropWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const nextScale = clampNumber(avatarCropScale + (event.deltaY < 0 ? 0.12 : -0.12), 1, 4);
    updateAvatarCrop(avatarCropOffset, nextScale);
  }
  function showProfileNotice(message: string) {
    setProfileNotice(message);
    setNotice(message);
  }

  function validateProfilePublicId(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return uiLabel(uiLanguage, { zh: "ID 不能为空。", en: "ID cannot be empty.", hi: "ID खाली नहीं हो सकती।" });
    if (!/^[a-z0-9]/.test(trimmed)) return uiLabel(uiLanguage, { zh: "ID 必须以字母或数字开头。", en: "ID must start with a letter or number.", hi: "ID अक्षर या संख्या से शुरू होनी चाहिए।" });
    if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(trimmed)) return uiLabel(uiLanguage, { zh: "ID 需要 3-32 位，只能包含字母、数字、点、下划线或短横线。", en: "ID must be 3-32 characters and only use letters, numbers, dots, underscores, or hyphens.", hi: "ID 3-32 अक्षरों की हो और उसमें केवल अक्षर, संख्या, डॉट, अंडरस्कोर या हाइफ़न हों।" });
    return "";
  }

  async function handleAvatarFile(file: File) {
    if (!accessToken) return;
    if (!file.type.startsWith("image/")) {
      showProfileNotice(t.mediaUnsupported);
      return;
    }
    setProfileNotice("");
    setAvatarUploading(true);
    setAvatarUploadProgress(0);
    const previewUrl = await readFileAsBase64(file);
    setProfileAvatarPreviewUrl(previewUrl);
    setProfileAvatarUrl(previewUrl);
    try {
      const uploaded = await uploadMediaWithProgress(file, accessToken, setAvatarUploadProgress);
      const nextAvatarUrl = normalizeMediaUrl(uploaded.url) ?? uploaded.url;
      setProfileAvatarUrl(nextAvatarUrl);
      const auth = await apiJson<AuthResponse>("/auth/profile", accessToken, {
        method: "POST",
        body: JSON.stringify({
          nickname: profileNicknameValue,
          avatarUrl: nextAvatarUrl,
          company: profileCompany,
          title: profileTitle,
          location: profileLocation,
          bio: profileBio,
          signature: profileSignature
        })
      });
      const normalizedAuth = { ...auth, user: { ...auth.user, avatarUrl: nextAvatarUrl } };
      storeAuth(normalizedAuth);
      setAccessToken(normalizedAuth.accessToken);
      setCurrentUser(normalizedAuth.user);
      setContactDetailsUser((current) => current?.id === normalizedAuth.user.id ? normalizedAuth.user : current);
      syncCurrentUserInConversationList(normalizedAuth.user);
      void loadConversations(normalizedAuth.accessToken);
      void loadFriendData(normalizedAuth.accessToken);
      showProfileNotice(t.profileSaved);
      setProfileEditing(false);
    } catch (error) {
      showProfileNotice(extractErrorMessage(error, t.mediaUploadFailed));
    } finally {
      setAvatarUploading(false);
      setAvatarUploadProgress(0);
    }
  }

  function handleAvatarInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showProfileNotice(t.mediaUnsupported);
      return;
    }
    setProfileNotice("");
    void readFileAsBase64(file).then((source) => {
      setAvatarCropTarget("profile");
      setAvatarCropSource(source);
      setAvatarCropScale(1);
      setAvatarCropOffset({ x: 0, y: 0 });
      setAvatarCropImageSize({ width: 0, height: 0 });
      setAvatarCropFrameSize(320);
    });
  }

  async function handleSaveProfile(event: FormEvent) {
    event.preventDefault();
    if (!accessToken) return;
    const publicIdError = validateProfilePublicId(profilePublicId);
    if (publicIdError) {
      showProfileNotice(publicIdError);
      return;
    }
    setProfileNotice("");
    setProfileSaving(true);
    try {
      const auth = await apiJson<AuthResponse>("/auth/profile", accessToken, {
        method: "POST",
        body: JSON.stringify({
          publicId: profilePublicId,
          profilePublic: profileIsPublic,
          profileEmailPublic,
          profilePhonePublic,
          phone: profilePhoneValue,
          nickname: profileNicknameValue,
          avatarUrl: profileAvatarUrl,
          company: profileCompany,
          title: profileTitle,
          location: profileLocation,
          bio: profileBio,
          signature: profileSignature
        })
      });
      const savedAvatarUrl = normalizeMediaUrl(auth.user.avatarUrl ?? profileAvatarUrl) ?? profileAvatarUrl;
      const normalizedAuth = { ...auth, user: { ...auth.user, avatarUrl: savedAvatarUrl } };
      storeAuth(normalizedAuth);
      setAccessToken(normalizedAuth.accessToken);
      setCurrentUser(normalizedAuth.user);
      setContactDetailsUser((current) => current?.id === normalizedAuth.user.id ? normalizedAuth.user : current);
      syncCurrentUserInConversationList(normalizedAuth.user);
      void loadConversations(normalizedAuth.accessToken);
      void loadFriendData(normalizedAuth.accessToken);
      showProfileNotice(t.profileSaved);
      setProfileEditing(false);
    } catch (error) {
      showProfileNotice(extractErrorMessage(error, t.profileSaveFailed));
    } finally {
      setProfileSaving(false);
    }
  }
  async function handleToggleProfilePublic(nextValue: boolean) {
    if (!accessToken) return;
    const previousValue = profileIsPublic;
    setProfileIsPublic(nextValue);
    setProfileNotice("");
    try {
      const auth = await apiJson<AuthResponse>("/auth/profile", accessToken, {
        method: "POST",
        body: JSON.stringify({ profilePublic: nextValue })
      });
      const savedAvatarUrl = normalizeMediaUrl(auth.user.avatarUrl ?? profileAvatarUrl) ?? profileAvatarUrl;
      const normalizedAuth = { ...auth, user: { ...auth.user, avatarUrl: savedAvatarUrl } };
      storeAuth(normalizedAuth);
      setAccessToken(normalizedAuth.accessToken);
      setCurrentUser(normalizedAuth.user);
      syncCurrentUserInConversationList(normalizedAuth.user);
      void loadConversations(normalizedAuth.accessToken);
      void loadFriendData(normalizedAuth.accessToken);
      showProfileNotice(t.profileSaved);
    } catch (error) {
      setProfileIsPublic(previousValue);
      showProfileNotice(extractErrorMessage(error, t.profileSaveFailed));
    }
  }

  async function handleToggleProfileEmailPublic(nextValue: boolean) {
    if (!accessToken) return;
    const previousValue = profileEmailPublic;
    setProfileEmailPublic(nextValue);
    setProfileNotice("");
    try {
      const auth = await apiJson<AuthResponse>("/auth/profile", accessToken, {
        method: "POST",
        body: JSON.stringify({ profileEmailPublic: nextValue })
      });
      const savedAvatarUrl = normalizeMediaUrl(auth.user.avatarUrl ?? profileAvatarUrl) ?? profileAvatarUrl;
      const normalizedAuth = { ...auth, user: { ...auth.user, avatarUrl: savedAvatarUrl } };
      storeAuth(normalizedAuth);
      setAccessToken(normalizedAuth.accessToken);
      setCurrentUser(normalizedAuth.user);
      syncCurrentUserInConversationList(normalizedAuth.user);
      void loadConversations(normalizedAuth.accessToken);
      void loadFriendData(normalizedAuth.accessToken);
      showProfileNotice(t.profileSaved);
    } catch (error) {
      setProfileEmailPublic(previousValue);
      showProfileNotice(extractErrorMessage(error, t.profileSaveFailed));
    }
  }

  async function handleToggleProfilePhonePublic(nextValue: boolean) {
    if (!accessToken) return;
    const previousValue = profilePhonePublic;
    setProfilePhonePublic(nextValue);
    setProfileNotice("");
    try {
      const auth = await apiJson<AuthResponse>("/auth/profile", accessToken, {
        method: "POST",
        body: JSON.stringify({ profilePhonePublic: nextValue })
      });
      const savedAvatarUrl = normalizeMediaUrl(auth.user.avatarUrl ?? profileAvatarUrl) ?? profileAvatarUrl;
      const normalizedAuth = { ...auth, user: { ...auth.user, avatarUrl: savedAvatarUrl } };
      storeAuth(normalizedAuth);
      setAccessToken(normalizedAuth.accessToken);
      setCurrentUser(normalizedAuth.user);
      syncCurrentUserInConversationList(normalizedAuth.user);
      void loadConversations(normalizedAuth.accessToken);
      void loadFriendData(normalizedAuth.accessToken);
      showProfileNotice(t.profileSaved);
    } catch (error) {
      setProfilePhonePublic(previousValue);
      showProfileNotice(extractErrorMessage(error, t.profileSaveFailed));
    }
  }

  async function handleSaveSignature() {
    if (!accessToken) return;
    setProfileNotice("");
    setProfileSignatureSaving(true);
    try {
      const auth = await apiJson<AuthResponse>("/auth/profile", accessToken, {
        method: "POST",
        body: JSON.stringify({ signature: profileSignature })
      });
      const savedAvatarUrl = normalizeMediaUrl(auth.user.avatarUrl ?? profileAvatarUrl) ?? profileAvatarUrl;
      const normalizedAuth = { ...auth, user: { ...auth.user, avatarUrl: savedAvatarUrl } };
      storeAuth(normalizedAuth);
      setAccessToken(normalizedAuth.accessToken);
      setCurrentUser(normalizedAuth.user);
      setProfileSignature(normalizedAuth.user.signature ?? "");
      setContactDetailsUser((current) => current?.id === normalizedAuth.user.id ? normalizedAuth.user : current);
      syncCurrentUserInConversationList(normalizedAuth.user);
      setProfileSignatureEditing(false);
      showProfileNotice(t.profileSaved);
    } catch (error) {
      showProfileNotice(extractErrorMessage(error, t.profileSaveFailed));
    } finally {
      setProfileSignatureSaving(false);
    }
  }

  async function handleChangePassword(event: FormEvent) {
    event.preventDefault();
    if (!accessToken) return;
    if (changePasswordNew.length < 8) {
      setNotice(t.passwordTooShort);
      return;
    }
    if (changePasswordNew !== changePasswordConfirm) {
      setNotice(t.passwordMismatch);
      return;
    }
    setChangePasswordSaving(true);
    try {
      await apiJson<{ ok: true }>("/auth/password", accessToken, {
        method: "POST",
        body: JSON.stringify({ currentPassword: changePasswordCurrent, newPassword: changePasswordNew })
      });
      setChangePasswordCurrent("");
      setChangePasswordNew("");
      setChangePasswordConfirm("");
      setNotice(t.passwordUpdated);
    } catch (error) {
      setNotice(extractErrorMessage(error, t.passwordChangeFailed));
    } finally {
      setChangePasswordSaving(false);
    }
  }



  async function loadAdminDashboard() {
    if (!accessToken || currentUser?.role !== "admin") return;
    setAdminLoading(true);
    try {
      const permissions = currentUser.adminPermissions ?? [];
      const canAdmin = (permission: AdminPermission) => permissions.length === 0 || permissions.includes(permission);
      const [overviewData, usersData, conversationsData, feedbackData, settingsData, adminsData] = await Promise.all([
        canAdmin("overview") ? apiJson<{ overview: AdminOverview }>("/admin/overview", accessToken) : Promise.resolve<{ overview: AdminOverview | null }>({ overview: null }),
        canAdmin("users") ? apiJson<{ users: AdminUserRow[] }>("/admin/users", accessToken) : Promise.resolve({ users: [] }),
        canAdmin("conversations") ? apiJson<{ conversations: AdminConversationRow[] }>("/admin/conversations", accessToken) : Promise.resolve({ conversations: [] }),
        canAdmin("feedback") ? apiJson<{ feedback: AdminFeedbackRow[] }>("/admin/feedback", accessToken) : Promise.resolve({ feedback: [] }),
        canAdmin("settings") ? apiJson<{ settings: AdminSettingRow[] }>("/admin/settings", accessToken) : Promise.resolve({ settings: [] }),
        canAdmin("admins") ? apiJson<{ admins: AdminUserRow[] }>("/admin/admins", accessToken) : Promise.resolve({ admins: [] })
      ]);
      setAdminOverview(overviewData.overview);
      setAdminUsers(usersData.users);
      setAdminConversations(conversationsData.conversations);
      setAdminFeedback(feedbackData.feedback);
      setAdminSettings(settingsData.settings);
      setAdminSettingDrafts(Object.fromEntries(settingsData.settings.map((item) => [item.key, item.value ?? ""])));
      setAdminSloganDrafts(parseAdminSlogans(settingsData.settings.find((item) => item.key === "APP_SLOGANS_JSON")?.value));
      setAdminAccounts(adminsData.admins);
      setAdminModalOpen(true);
      if (canAdmin("overview") || canAdmin("settings")) {
        setAdminToolHealth(null);
        setAdminToolHealthError("");
        void loadAdminToolHealth();
      }
    } catch (error) {
      setNotice(extractErrorMessage(error, t.adminLoadFailed));
    } finally {
      setAdminLoading(false);
    }
  }

  useEffect(() => {
    if (!adminModalOpen || !accessToken || currentUser?.role !== "admin") return;
    const keyword = adminUserQuery.trim();
    const timer = window.setTimeout(() => {
      void apiJson<{ users: AdminUserRow[] }>(`/admin/users${keyword ? `?query=${encodeURIComponent(keyword)}` : ""}`, accessToken)
        .then((data) => setAdminUsers(data.users))
        .catch((error) => setNotice(extractErrorMessage(error, t.adminLoadFailed)));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [adminModalOpen, adminUserQuery, accessToken, currentUser?.role, t.adminLoadFailed]);
  async function loadAdminUserChats(user: AdminUserRow) {
    if (!accessToken || currentUser?.role !== "admin") return;
    setAdminUserChatsLoadingId(user.id);
    setAdminUserChatQuery("");
    try {
      const data = await apiJson<AdminUserChats>(`/admin/users/${user.id}/chats`, accessToken);
      setAdminSelectedUserChats(data);
    } catch (error) {
      setNotice(extractErrorMessage(error, t.adminLoadUserChatsFailed));
    } finally {
      setAdminUserChatsLoadingId("");
    }
  }
  async function setAdminUserDisabled(user: AdminUserRow, disabled: boolean) {
    if (!accessToken || currentUser?.role !== "admin" || user.id === currentUser.id) return;
    setAdminActionUserId(user.id);
    try {
      const data = await apiJson<{ user: AdminUserRow }>(`/admin/users/${user.id}/${disabled ? "disable" : "enable"}`, accessToken, { method: "POST" });
      setAdminUsers((items) => items.map((item) => (item.id === user.id ? data.user : item)));
      setAdminOverview((overview) => overview ? { ...overview, disabledUsers: Math.max(0, overview.disabledUsers + (disabled ? 1 : -1)) } : overview);
      setNotice(disabled ? t.adminUserDisabled : t.adminUserEnabled);
    } catch (error) {
      setNotice(extractErrorMessage(error, t.adminUserActionFailed));
    } finally {
      setAdminActionUserId("");
    }
  }
  async function resetAdminUserPassword(user: AdminUserRow) {
    if (!accessToken || currentUser?.role !== "admin" || user.id === currentUser.id) return;
    setAdminActionUserId(user.id);
    try {
      const data = await apiJson<{ user: AdminUserRow; temporaryPassword: string }>(`/admin/users/${user.id}/reset-password`, accessToken, { method: "POST" });
      setAdminPasswordReset(data);
      setNotice(t.adminPasswordResetDone);
    } catch (error) {
      setNotice(extractErrorMessage(error, t.adminPasswordResetFailed));
    } finally {
      setAdminActionUserId("");
    }
  }
  function toggleAdminAccountFormPermission(permission: AdminPermission) {
    setAdminAccountForm((form) => ({
      ...form,
      adminPermissions: form.adminPermissions.includes(permission)
        ? form.adminPermissions.filter((item) => item !== permission)
        : [...form.adminPermissions, permission]
    }));
  }

  async function loadAdminToolHealth() {
    if (!accessToken || currentUser?.role !== "admin") return;
    setAdminToolHealthLoading(true);
    setAdminToolHealthError("");
    try {
      const data = await apiJson<AdminToolHealth>("/admin/tools/health", accessToken, undefined, 180000);
      if (!Array.isArray(data.tools) || data.tools.length === 0) throw new Error("Health check returned no tool results.");
      setAdminToolHealth(mergeBrowserTtsHealth(data));
    } catch (error) {
      const message = extractErrorMessage(error, uiLabel(uiLanguage, { zh: "工具健康检查失败。", en: "Tool health check failed.", hi: "टूल स्वास्थ्य जांच विफल रही।" }));
      setAdminToolHealthError(message);
      setNotice(message);
    } finally {
      setAdminToolHealthLoading(false);
    }
  }

  async function retestAdminToolHealth(toolId: string) {
    if (!accessToken || currentUser?.role !== "admin" || adminToolRetestingIds.has(toolId)) return;
    setAdminToolRetestingIds((current) => new Set(current).add(toolId));
    try {
      const data = mergeBrowserTtsHealth(await apiJson<AdminToolHealth>(`/admin/tools/health/${encodeURIComponent(toolId)}`, accessToken, { method: "POST" }));
      const refreshed = data.tools[0];
      if (!refreshed) throw new Error("Health check returned no result.");
      setAdminToolHealth((current) => current ? { checkedAt: data.checkedAt, tools: current.tools.map((item) => item.id === refreshed.id ? refreshed : item) } : data);
    } catch (error) {
      setNotice(extractErrorMessage(error, uiLabel(uiLanguage, { zh: "单项工具重测失败。", en: "Could not retest this integration.", hi: "इस इंटीग्रेशन की दोबारा जांच नहीं हो सकी।" })));
    } finally {
      setAdminToolRetestingIds((current) => {
        const next = new Set(current);
        next.delete(toolId);
        return next;
      });
    }
  }

  function updateAdminSlogan(index: number, field: "zh" | "en" | "hi", value: string) {
    setAdminSloganDrafts((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
  }

  function toggleAdminSlogan(index: number) {
    setAdminSloganDrafts((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, enabled: !item.enabled } : item));
  }

  function addAdminSlogan() {
    setAdminSloganDrafts((items) => {
      let suffix = items.length + 1;
      let id = `custom-${suffix}`;
      while (items.some((item) => item.id === id)) {
        suffix += 1;
        id = `custom-${suffix}`;
      }
      return [...items, { id, zh: "", en: "", hi: "", enabled: true }];
    });
  }

  function removeAdminSlogan(index: number) {
    setAdminSloganDrafts((items) => items.length <= 1 ? items : items.filter((_, itemIndex) => itemIndex !== index));
  }

  function resetAdminSlogans() {
    setAdminSloganDrafts(defaultAdminSlogans());
  }

  async function regenerateAdminSlogans() {
    if (!accessToken || currentUser?.role !== "admin") return;
    const prompt = adminSloganPrompt.trim();
    if (!prompt) {
      const message = uiLabel(uiLanguage, { zh: "请先输入标语生成提示词。", en: "Enter a slogan generation prompt first.", hi: "पहले नारा बनाने का प्रॉम्प्ट दर्ज करें।" });
      setAdminSettingsNotice(message);
      setNotice(message);
      return;
    }
    setAdminSloganGenerating(true);
    setAdminSettingsNotice("");
    try {
      const data = await apiJson<{ model: string; prompt: string; creativeDirection?: string; slogans: AdminSlogan[] }>("/admin/slogans/generate", accessToken, {
        method: "POST",
        body: JSON.stringify({ prompt })
      }, 180000);
      if (data.slogans.length !== 20) throw new Error("The generator did not return exactly 20 slogans.");
      setAdminSloganDrafts(data.slogans);
      const message = uiLabel(uiLanguage, {
        zh: "已重新生成20条三语标语。请先检查和修改，确认后点击“发布”正式生效。",
        en: "Generated 20 trilingual slogans. Review or edit them, then click Publish.",
        hi: "20 त्रिभाषी नारे बन गए। समीक्षा या संपादन के बाद प्रकाशित करें।"
      });
      setAdminSettingsNotice(message);
      setNotice(message);
    } catch (error) {
      const timedOut = error instanceof Error && error.message === requestTimeoutMessage();
      const message = timedOut
        ? uiLabel(uiLanguage, { zh: "AI 生成超过 180 秒，请检查百炼模型健康状态后重试。", en: "AI generation exceeded 180 seconds. Check the Bailian model health and try again.", hi: "AI निर्माण में 180 सेकंड से अधिक समय लगा। Bailian मॉडल की स्थिति जाँचकर फिर प्रयास करें।" })
        : extractErrorMessage(error, uiLabel(uiLanguage, { zh: "标语重新生成失败。", en: "Could not regenerate slogans.", hi: "नारे दोबारा नहीं बन सके।" }));
      setAdminSettingsNotice(message);
      setNotice(message);
    } finally {
      setAdminSloganGenerating(false);
    }
  }

  async function publishAdminSlogans() {
    if (!accessToken || currentUser?.role !== "admin") return;
    setAdminSloganPublishing(true);
    setAdminSettingsNotice("");
    try {
      const data = await apiJson<{ ok: true; publishedAt: string; slogans: AdminSlogan[]; publicSlogans: AppSlogan[]; settings: AdminSettingRow[] }>("/admin/slogans/publish", accessToken, {
        method: "POST",
        body: JSON.stringify({ slogans: adminSloganDrafts })
      });
      setAdminSloganDrafts(data.slogans);
      setAdminSettings(data.settings);
      setAdminSettingDrafts(Object.fromEntries(data.settings.map((item) => [item.key, item.value ?? ""])));
      setAppSlogans(data.publicSlogans);
      setActiveSlogan(pickRandomSlogan(data.publicSlogans));
      const message = uiLabel(uiLanguage, {
        zh: "标语已发布并立即生效。",
        en: "Slogans published and applied immediately.",
        hi: "नारे प्रकाशित होकर तुरंत लागू हो गए।"
      });
      setAdminSettingsNotice(message);
      setNotice(message);
    } catch (error) {
      const message = extractErrorMessage(error, uiLabel(uiLanguage, { zh: "标语发布失败。", en: "Could not publish slogans.", hi: "नारे प्रकाशित नहीं हो सके।" }));
      setAdminSettingsNotice(message);
      setNotice(message);
    } finally {
      setAdminSloganPublishing(false);
    }
  }

  async function saveAdminSettings() {
    if (!accessToken || currentUser?.role !== "admin") return;
    const invalidSlogan = adminSloganDrafts.find((slogan) => !slogan.id.trim() || !slogan.zh.trim() || !slogan.en.trim() || !slogan.hi.trim());
    if (invalidSlogan) {
      const message = uiLabel(uiLanguage, { zh: "请先补全每条标语的中文、英文和印地语内容。", en: "Complete the Chinese, English, and Hindi text for every slogan before saving.", hi: "सहेजने से पहले हर नारे का चीनी, अंग्रेज़ी और हिंदी टेक्स्ट पूरा करें।" });
      setAdminSettingsNotice(message);
      setNotice(message);
      return;
    }
    if (!adminSloganDrafts.some((slogan) => slogan.enabled)) {
      const message = uiLabel(uiLanguage, { zh: "至少保留一条启用中的标语。", en: "Keep at least one slogan enabled.", hi: "कम से कम एक नारा चालू रखें।" });
      setAdminSettingsNotice(message);
      setNotice(message);
      return;
    }
    setAdminSettingsSaving(true);
    setAdminSettingsNotice("");
    try {
      const sloganJson = serializeAdminSlogans(adminSloganDrafts);
      const enabledSloganIds = JSON.stringify(adminSloganDrafts.filter((slogan) => slogan.enabled).map((slogan) => slogan.id));
      const data = await apiJson<{ settings: AdminSettingRow[] }>("/admin/settings", accessToken, {
        method: "POST",
        body: JSON.stringify({ settings: adminSettings.map((item) => ({
          key: item.key,
          value: item.key === "APP_SLOGANS_JSON" ? sloganJson : item.key === "APP_SLOGAN_ENABLED_IDS" ? enabledSloganIds : adminSettingDrafts[item.key] ?? ""
        })) })
      });
      setAdminSettings(data.settings);
      setAdminSettingDrafts(Object.fromEntries(data.settings.map((item) => [item.key, item.value ?? ""])));
      setAdminSloganDrafts(parseAdminSlogans(data.settings.find((item) => item.key === "APP_SLOGANS_JSON")?.value));
      const changedKeys = Object.keys(adminSettingDrafts).filter((key) => adminSettings.some((item) => item.key === key));
      const changedGroups = Array.from(new Set(adminSettings.filter((item) => changedKeys.includes(item.key)).map((item) => item.group)));
      const changedLabel = changedGroups.length ? changedGroups.join(" / ") : uiLabel(uiLanguage, { zh: "系统配置", en: "system settings", hi: "सिस्टम सेटिंग्स" });
      setAdminSettingsNotice(uiLabel(uiLanguage, { zh: `已保存：${changedLabel}。部分前台配置需要刷新设置或重新登录后生效。`, en: `Saved: ${changedLabel}. Some frontend settings require refresh or signing in again to take effect.`, hi: `सहेजा गया: ${changedLabel}। कुछ फ्रंटएंड सेटिंग्स रीफ़्रेश या दोबारा लॉगिन करने के बाद लागू होंगी।` }));
      setNotice(uiLabel(uiLanguage, { zh: "系统配置已保存。", en: "System settings saved.", hi: "सिस्टम सेटिंग्स सहेजी गईं।" }));
    } catch (error) {
      const message = extractErrorMessage(error, uiLabel(uiLanguage, { zh: "系统配置保存失败。", en: "Could not save system settings.", hi: "सिस्टम सेटिंग्स सहेजी नहीं जा सकीं।" }));
      setAdminSettingsNotice(message);
      setNotice(message);
    } finally {
      setAdminSettingsSaving(false);
    }
  }

  async function testAdminSmtp() {
    if (!accessToken || currentUser?.role !== "admin") return;
    setAdminSmtpTestSaving(true);
    setAdminSettingsNotice("");
    try {
      // Test only the saved/effective SMTP configuration. Draft values must be
      // saved explicitly first so this action can never overwrite valid SMTP
      // settings with an uninitialized empty form.
      const result = await apiJson<{ ok: true; status: "submitted"; messageId?: string; response?: string; recipientDomain?: string; warnings?: string[] }>("/admin/settings/smtp-test", accessToken, { method: "POST", body: JSON.stringify({}) });
      const hasWarning = Boolean(result.warnings?.length);
      const message = uiLabel(uiLanguage, {
        zh: `邮件服务商已接收测试邮件并进入投递队列${result.messageId ? `（Message-ID：${result.messageId}）` : ""}。这不等于已送达，请检查收件箱、垃圾邮件及服务商投递日志。${hasWarning ? `\n配置警告：${result.warnings?.join("；")}` : ""}`,
        en: `The provider accepted the test email for delivery${result.messageId ? ` (Message-ID: ${result.messageId})` : ""}. This does not confirm inbox delivery; check spam and the provider delivery log.${hasWarning ? `\nConfiguration warning: ${result.warnings?.join("; ")}` : ""}`,
        hi: `ईमेल प्रदाता ने परीक्षण ईमेल डिलीवरी कतार में स्वीकार किया${result.messageId ? ` (Message-ID: ${result.messageId})` : ""}। इसका अर्थ इनबॉक्स में पहुँच जाना नहीं है; स्पैम और प्रदाता डिलीवरी लॉग जांचें।${hasWarning ? `\nकॉन्फ़िगरेशन चेतावनी: ${result.warnings?.join("; ")}` : ""}`
      });
      setAdminSettingsNotice(message);
      setNotice(message);
    } catch (error) {
      const message = extractErrorMessage(error, uiLabel(uiLanguage, { zh: "测试邮件发送失败。", en: "The SMTP test email could not be sent.", hi: "SMTP परीक्षण ईमेल नहीं भेजा जा सका।" }));
      setAdminSettingsNotice(message);
      setNotice(message);
    } finally {
      setAdminSmtpTestSaving(false);
    }
  }

  async function createAdminAccount() {
    if (!accessToken || currentUser?.role !== "admin") return;
    const email = adminAccountForm.email.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      const message = uiLabel(uiLanguage, { zh: "请输入有效的管理员邮箱。", en: "Enter a valid administrator email.", hi: "एक मान्य एडमिन ईमेल दर्ज करें।" });
      setAdminAccountNotice(message);
      return;
    }
    if (adminAccountForm.password.length > 0 && adminAccountForm.password.length < 8) {
      const message = uiLabel(uiLanguage, { zh: "创建新账号时，初始密码至少需要8个字符；提升已有用户时可留空。", en: "For a new account, the initial password must contain at least 8 characters; leave it blank when promoting an existing user.", hi: "नए खाते के लिए प्रारंभिक पासवर्ड कम से कम 8 अक्षर का होना चाहिए; मौजूदा उपयोगकर्ता को एडमिन बनाते समय इसे खाली छोड़ें।" });
      setAdminAccountNotice(message);
      return;
    }
    setAdminAccountSaving(true);
    setAdminAccountNotice("");
    try {
      const data = await apiJson<{ admin: AdminUserRow; promoted: boolean }>("/admin/admins", accessToken, {
        method: "POST",
        body: JSON.stringify({ ...adminAccountForm, email })
      });
      setAdminAccounts((items) => [data.admin, ...items.filter((item) => item.id !== data.admin.id)]);
      setAdminUsers((items) => [data.admin, ...items.filter((item) => item.id !== data.admin.id)]);
      setAdminAccountForm({ email: "", phone: "", nickname: "", password: "", adminPermissions: ADMIN_PERMISSION_OPTIONS.map((item) => item.code) });
      const message = data.promoted
        ? uiLabel(uiLanguage, { zh: "已有普通用户已提升为管理员，原账号和原密码保持不变。", en: "The existing user was promoted to administrator; the original account and password are unchanged.", hi: "मौजूदा उपयोगकर्ता को एडमिन बना दिया गया है; मूल खाता और पासवर्ड नहीं बदले हैं।" })
        : uiLabel(uiLanguage, { zh: "管理员账户已创建，可使用注册邮箱和初始密码登录。", en: "Administrator account created. It can sign in with the email and initial password.", hi: "एडमिन खाता बन गया। ईमेल और प्रारंभिक पासवर्ड से लॉगिन किया जा सकता है।" });
      setAdminAccountNotice(message);
      setNotice(message);
    } catch (error) {
      const message = extractErrorMessage(error, uiLabel(uiLanguage, { zh: "管理员账户创建失败。", en: "Could not create administrator.", hi: "एडमिन खाता नहीं बन सका।" }));
      setAdminAccountNotice(message);
      setNotice(message);
    } finally {
      setAdminAccountSaving(false);
    }
  }

  async function saveAdminPermissions(admin: AdminUserRow, permission: AdminPermission, checked: boolean) {
    if (!accessToken || currentUser?.role !== "admin") return;
    const nextPermissions = checked
      ? Array.from(new Set([...(admin.adminPermissions ?? []), permission]))
      : (admin.adminPermissions ?? []).filter((item) => item !== permission);
    setAdminActionUserId(admin.id);
    try {
      const data = await apiJson<{ admin: AdminUserRow }>(`/admin/admins/${admin.id}/permissions`, accessToken, {
        method: "POST",
        body: JSON.stringify({ adminPermissions: nextPermissions })
      });
      setAdminAccounts((items) => items.map((item) => (item.id === data.admin.id ? data.admin : item)));
      setAdminUsers((items) => items.map((item) => (item.id === data.admin.id ? data.admin : item)));
    } catch (error) {
      setNotice(extractErrorMessage(error, uiLabel(uiLanguage, { zh: "权限保存失败。", en: "Could not save permissions.", hi: "अनुमतियां सहेजी नहीं जा सकीं।" })));
    } finally {
      setAdminActionUserId("");
    }
  }
  async function updateAdminFeedbackStatus(feedback: AdminFeedbackRow, status: string) {
    if (!accessToken || currentUser?.role !== "admin") return;
    setAdminFeedbackActionId(feedback.id);
    try {
      const data = await apiJson<{ feedback: AdminFeedbackRow }>(`/admin/feedback/${feedback.id}/status`, accessToken, {
        method: "POST",
        body: JSON.stringify({ status })
      });
      setAdminFeedback((items) => items.map((item) => (item.id === feedback.id ? data.feedback : item)));
      setNotice(t.adminFeedbackUpdated);
    } catch (error) {
      setNotice(extractErrorMessage(error, t.adminFeedbackUpdateFailed));
    } finally {
      setAdminFeedbackActionId("");
    }
  }
  async function sendFeedbackAttachment(file: File) {
    if (!accessToken) return;
    if (!file.type.startsWith("image/")) {
      setNotice(t.mediaUnsupported);
      return;
    }
    setFeedbackAttachmentUploading(true);
    setFeedbackAttachmentProgress(0);
    try {
      const uploaded = await uploadMediaWithProgress(file, accessToken, setFeedbackAttachmentProgress);
      setFeedbackAttachment(uploaded);
      setNotice(t.feedbackAttachmentReady);
    } catch (error) {
      setNotice(extractErrorMessage(error, t.mediaUploadFailed));
    } finally {
      setFeedbackAttachmentUploading(false);
      setFeedbackAttachmentProgress(0);
    }
  }

  function handleFeedbackAttachmentChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void sendFeedbackAttachment(file);
  }
  async function submitFeedback(event: FormEvent) {
    event.preventDefault();
    const message = feedbackMessage.trim();
    if (message.length < 5) {
      setNotice(t.feedbackTooShort);
      return;
    }
    setFeedbackSaving(true);
    try {
      await apiJson<{ feedback: { id: string } }>("/feedback", accessToken, {
        method: "POST",
        body: JSON.stringify({ category: "general", message, attachmentUrl: feedbackAttachment?.url })
      });
      setFeedbackMessage("");
      setNotice(t.feedbackSent);
    } catch (error) {
      setNotice(extractErrorMessage(error, t.feedbackFailed));
    } finally {
      setFeedbackSaving(false);
    }
  }
  async function sendAuthVerificationCode() {
    const email = authEmail.trim().toLowerCase();
    setAuthError("");
    setAuthCodeNotice("");
    if (!isValidEmailAddress(email)) {
      setAuthError(uiLabel(uiLanguage, { zh: "请输入有效的邮箱地址。", en: "Enter a valid email address.", hi: "मान्य ईमेल पता दर्ज करें।" }));
      return;
    }
    setAuthCodeSending(true);
    try {
      const response = await fetchWithTimeout(`${getApiUrl()}/auth/send-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string | string[]; status?: "submitted"; warnings?: string[] };
      if (!response.ok) {
        const message = Array.isArray(data.message) ? data.message.join("; ") : data.message;
        throw new Error(message || uiLabel(uiLanguage, { zh: "验证码发送失败。", en: "Could not send verification code.", hi: "सत्यापन कोड नहीं भेजा जा सका।" }));
      }
      const warning = data.warnings?.length ? ` ${data.warnings.join("；")}` : "";
      setAuthCodeNotice(uiLabel(uiLanguage, {
        zh: `验证码邮件已提交给邮件服务商，请检查收件箱和垃圾邮件；未收到时请联系管理员查看投递日志。${warning}`,
        en: `The verification email was submitted to the mail provider. Check the inbox and spam folder; if it does not arrive, ask an administrator to inspect the delivery log.${warning}`,
        hi: `सत्यापन ईमेल मेल प्रदाता को भेज दिया गया है। इनबॉक्स और स्पैम देखें; न मिलने पर एडमिन से डिलीवरी लॉग जाँचने को कहें।${warning}`
      }));
    } catch (error) {
      setAuthError(extractErrorMessage(error, uiLabel(uiLanguage, { zh: "验证码发送失败。", en: "Could not send verification code.", hi: "सत्यापन कोड नहीं भेजा जा सका।" })));
    } finally {
      setAuthCodeSending(false);
    }
  }

  async function requestForgotPassword() {
    const email = authEmail.trim().toLowerCase();
    setAuthError("");
    setAuthCodeNotice("");
    if (!isValidEmailAddress(email)) {
      setAuthError(uiLabel(uiLanguage, { zh: "请输入有效的邮箱地址。", en: "Enter a valid email address.", hi: "मान्य ईमेल पता दर्ज करें।" }));
      return;
    }
    try {
      await apiJson<{ ok: true }>("/auth/forgot-password", "", {
        method: "POST",
        body: JSON.stringify({ email })
      });
      setAuthCodeNotice(uiLabel(uiLanguage, { zh: "如果邮箱已注册，密码重置链接已发送，请检查收件箱和垃圾邮件。", en: "If the email is registered, a password reset link has been sent. Check your inbox and spam folder.", hi: "यदि ईमेल पंजीकृत है, तो पासवर्ड रीसेट लिंक भेज दिया गया है। इनबॉक्स और स्पैम फ़ोल्डर देखें।" }));
    } catch (error) {
      setAuthError(extractErrorMessage(error, uiLabel(uiLanguage, { zh: "密码重置申请提交失败。", en: "Could not submit password reset request.", hi: "पासवर्ड रीसेट अनुरोध जमा नहीं हो सका।" })));
    }
  }

  async function submitAuth(event: FormEvent) {
    event.preventDefault();
    setAuthError("");
    const email = authEmail.trim().toLowerCase();
    if (!isValidEmailAddress(email)) {
      setAuthError(uiLabel(uiLanguage, { zh: "这里只接受邮箱地址，请输入有效邮箱。", en: "Only email addresses are accepted here. Enter a valid email.", hi: "यहां केवल ईमेल पता स्वीकार है। मान्य ईमेल दर्ज करें।" }));
      return;
    }
    setAuthLoading(true);
    try {
      const endpoint = authMode === "login" ? "/auth/login" : "/auth/register";
      const response = await fetchWithTimeout(`${getApiUrl()}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          authMode === "login"
            ? { email, password: authPassword }
            : { email, password: authPassword, nickname: authNickname.trim(), language: getBackendUserLanguage(uiLanguage), code: authVerificationCode.trim() }
        )
      });
      const data = (await response.json()) as unknown;
      if (!response.ok || typeof data !== "object" || data === null || !("accessToken" in data)) {
        const maybeMessage = typeof data === "object" && data !== null && "message" in data ? (data as { message?: string | string[] }).message : undefined;
        const message = Array.isArray(maybeMessage) ? maybeMessage.join("; ") : maybeMessage;
        throw new Error(message || t.authFailed);
      }
      const auth = data as AuthResponse;
      window.localStorage.setItem("glimpse.uiLanguage", uiLanguage);
      const justRegistered = authMode === "register";
      storeAuth(auth);
      setAccessToken(auth.accessToken);
      setCurrentUser(auth.user);
      if (justRegistered) {
        setWelcomeOpen(true);
        setWelcomeDismissed(false);
        setMobilePane("chat");
      }
      await loadConversations(auth.accessToken);
    } catch (error) {
      setAuthError(extractErrorMessage(error, t.authFailed));
    } finally {
      setAuthLoading(false);
    }
  }

  function logout() {
    endActiveCall(false);
    clearStoredAuth();
    socketRef.current?.disconnect();
    socketRef.current = null;
    setAccessToken("");
    setCurrentUser(null);
    setIsConnected(false);
    setConnectionState("offline");
  }



  function openGroupDetails(groupOverride?: Conversation) {
    const group = groupOverride ?? selected;
    if (group.type !== "group") return;
    setGroupDetailsConversation(group);
    setGroupDetailsOpen(true);
    setGroupTitleEditValue(group.name);
    setGroupAnnouncementValue(group.announcement ?? "");
    setGroupAnnouncementScrollValue(group.announcementScroll !== false);
    setGroupInviteSelectedIds([]);
    setGroupError("");
    void loadFriendData(accessToken);
    void loadGroupMembers(group.id);
  }

  async function revokeAdminAccess(admin: AdminUserRow) {
    if (!accessToken || !currentUser?.isSuperAdmin || admin.isSuperAdmin || admin.id === currentUser.id) return;
    const confirmed = window.confirm(uiLabel(uiLanguage, {
      zh: `确定撤销“${admin.nickname}”的管理员身份吗？该账号会保留为普通用户，原密码和聊天数据不会删除。`,
      en: `Revoke administrator access from "${admin.nickname}"? The account, password, and chat data will remain as a regular user.`,
      hi: `“${admin.nickname}” की एडमिन पहुँच रद्द करें? खाता, पासवर्ड और चैट डेटा सामान्य उपयोगकर्ता के रूप में बने रहेंगे।`
    }));
    if (!confirmed) return;
    setAdminActionUserId(admin.id);
    try {
      await apiJson<{ ok: true; removedAdminId: string }>(`/admin/admins/${admin.id}`, accessToken, { method: "DELETE" });
      setAdminAccounts((items) => items.filter((item) => item.id !== admin.id));
      setAdminUsers((items) => items.map((item) => item.id === admin.id ? { ...item, role: "user", isSuperAdmin: false, adminPermissions: [] } : item));
      setNotice(uiLabel(uiLanguage, { zh: "管理员身份已撤销，账号、原密码和聊天数据均已保留。", en: "Administrator access was revoked; the account, original password, and chat data were preserved.", hi: "एडमिन पहुँच रद्द कर दी गई; खाता, मूल पासवर्ड और चैट डेटा सुरक्षित हैं।" }));
    } catch (error) {
      setNotice(extractErrorMessage(error, uiLabel(uiLanguage, { zh: "撤销管理员身份失败。", en: "Could not revoke administrator access.", hi: "एडमिन पहुँच रद्द नहीं की जा सकी।" })));
    } finally {
      setAdminActionUserId("");
    }
  }

  function normalizeGroupMembers(members: GroupMemberSummary[]) {
    return members.map((member) => ({
      ...member,
      user: { ...member.user, avatarUrl: normalizeMediaUrl(member.user.avatarUrl ?? undefined) },
      invitedBy: member.invitedBy ? { ...member.invitedBy, avatarUrl: normalizeMediaUrl(member.invitedBy.avatarUrl ?? undefined) } : member.invitedBy
    }));
  }

  async function loadGroupMembers(conversationId: string, token = accessToken) {
    const requestId = ++groupMembersRequestRef.current;
    setGroupMembersLoading(true);
    try {
      const data = await apiJson<{ members: GroupMemberSummary[] }>(`/conversations/${encodeURIComponent(conversationId)}/members`, token);
      const normalized = normalizeGroupMembers(data.members ?? []);
      if (requestId !== groupMembersRequestRef.current) return normalized;
      setGroupMembers(normalized);
      setGroupMembersConversationId(conversationId);
      return normalized;
    } catch (error) {
      if (requestId === groupMembersRequestRef.current) {
        setGroupMembersConversationId(conversationId);
        setGroupError(extractErrorMessage(error, t.requestFailed));
      }
      return [];
    } finally {
      if (requestId === groupMembersRequestRef.current) setGroupMembersLoading(false);
    }
  }

  async function openGroupCallPicker(group: Conversation, media: CallMediaKind) {
    if (group.type !== "group" || activeCallRef.current) return;
    setGroupCallPicker({ conversationId: group.id, media });
    setGroupCallMemberIds([]);
    setGroupCallError("");
    setGroupDetailsOpen(false);
    setGroupDetailsConversation(null);
    setGroupCallLoading(true);
    try {
      const members = await loadGroupMembers(group.id);
      const selectableIds = members.filter((member) => member.user.id !== currentUser?.id).map((member) => member.user.id);
      setGroupCallMemberIds(selectableIds);
      if (selectableIds.length === 0) setGroupCallError(t.callNoMembers);
    } finally {
      setGroupCallLoading(false);
    }
  }

  function toggleGroupCallMember(userId: string) {
    setGroupCallError("");
    setGroupCallMemberIds((current) => current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]);
  }

  function selectAllGroupCallMembers() {
    const selectableIds = groupMembers.filter((member) => member.user.id !== currentUser?.id).map((member) => member.user.id);
    setGroupCallMemberIds(selectableIds);
    setGroupCallError("");
  }

  function clearGroupCallMembers() {
    setGroupCallMemberIds([]);
    setGroupCallError("");
  }

  function confirmGroupCall() {
    const picker = groupCallPicker;
    if (!picker) return;
    const participantUserIds = Array.from(new Set(groupCallMemberIds.filter((id) => id && id !== currentUser?.id)));
    if (participantUserIds.length === 0) {
      setGroupCallError(t.callNeedMember);
      return;
    }
    const group = conversationsRef.current.find((conversation) => conversation.id === picker.conversationId) ?? (selected.id === picker.conversationId ? selected : null);
    if (!group || group.type !== "group") {
      setGroupCallError(t.requestFailed);
      return;
    }
    setGroupCallPicker(null);
    setGroupCallMemberIds([]);
    setGroupCallError("");
    if (selected.id === picker.conversationId) {
      void startCall(picker.media, participantUserIds);
      return;
    }
    setPendingContactCall({ conversationId: picker.conversationId, media: picker.media, participantUserIds });
    selectConversation(picker.conversationId);
  }

  function requestCall(media: CallMediaKind) {
    if (!selectedExists || activeCallRef.current) return;
    if (selected.type === "group") {
      void openGroupCallPicker(selected, media);
      return;
    }
    void startCall(media);
  }

  function toggleInviteMember(userId: string) {
    setGroupError("");
    setGroupInviteSelectedIds((current) => current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]);
  }

  async function inviteMembersToSelectedGroup() {
    const group = groupDetailsConversation ?? selected;
    if (group.type !== "group" || groupInviteSaving) return;
    if (groupInviteSelectedIds.length < 1) {
      setGroupError(t.groupNoInviteCandidates);
      return;
    }
    setGroupInviteSaving(true);
    setGroupError("");
    try {
      const data = await apiJson<{ conversation: ConversationSummary; members: GroupMemberSummary[] }>(`/conversations/${encodeURIComponent(group.id)}/members`, accessToken, {
        method: "POST",
        body: JSON.stringify({ userIds: groupInviteSelectedIds })
      });
      const mapped = mapConversation(data.conversation);
      setConversations((items) => items.map((item) => item.id === mapped.id ? { ...item, ...mapped } : item));
      setGroupDetailsConversation((current) => current?.id === mapped.id ? { ...current, ...mapped } : mapped);
      setGroupMembers(normalizeGroupMembers(data.members));
      setGroupInviteSelectedIds([]);
      setNotice(t.groupInviteSuccess);
    } catch (error) {
      setGroupError(extractErrorMessage(error, t.groupInviteFailed));
    } finally {
      setGroupInviteSaving(false);
    }
  }

  async function saveSelectedGroupSettings(nextAvatarUrl?: string) {
    const group = groupDetailsConversation ?? selected;
    if (group.type !== "group") return;
    setGroupError("");
    try {
      const data = await apiJson<{ conversation: ConversationSummary }>(`/conversations/${encodeURIComponent(group.id)}/group-profile`, accessToken, {
        method: "PATCH",
        body: JSON.stringify({ title: groupTitleEditValue, announcement: groupAnnouncementValue, announcementScroll: groupAnnouncementScrollValue, ...(nextAvatarUrl !== undefined ? { avatarUrl: nextAvatarUrl } : {}) })
      });
      const mapped = mapConversation(data.conversation);
      setConversations((items) => items.map((item) => item.id === mapped.id ? { ...item, ...mapped } : item));
      setGroupDetailsConversation((current) => current?.id === mapped.id ? { ...current, ...mapped } : mapped);
      setGroupTitleEditValue(mapped.name);
      setGroupAnnouncementValue(mapped.announcement ?? "");
      setGroupAnnouncementScrollValue(mapped.announcementScroll !== false);
      setNotice(t.groupSettingsSaved);
    } catch (error) {
      setGroupError(extractErrorMessage(error, t.requestFailed));
    }
  }

  async function uploadSelectedGroupAvatar(file: File) {
    const group = groupDetailsConversation ?? selected;
    if (group.type !== "group") return;
    if (!file.type.startsWith("image/")) {
      setGroupError(t.mediaUnsupported);
      return;
    }
    setGroupAvatarUploading(true);
    setGroupError("");
    try {
      const uploaded = await uploadMediaWithProgress(file, accessToken, () => undefined);
      await saveSelectedGroupSettings(uploaded.url);
    } catch (error) {
      setGroupError(extractErrorMessage(error, t.mediaUploadFailed));
    } finally {
      setGroupAvatarUploading(false);
    }
  }

  function handleGroupAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setGroupError(t.mediaUnsupported);
      return;
    }
    void readFileAsBase64(file).then((source) => {
      setAvatarCropTarget("group");
      setAvatarCropSource(source);
      setAvatarCropScale(1);
      setAvatarCropOffset({ x: 0, y: 0 });
      setAvatarCropImageSize({ width: 0, height: 0 });
      setAvatarCropFrameSize(320);
      setGroupError("");
    });
  }

  async function dissolveSelectedGroup() {
    const group = groupDetailsConversation ?? selected;
    if (group.type !== "group") return;
    if (!window.confirm(t.groupDissolveConfirm)) return;
    try {
      await apiJson<{ ok: true }>(`/conversations/${encodeURIComponent(group.id)}/group`, accessToken, { method: "DELETE" });
      setConversations((items) => items.filter((item) => item.id !== group.id));
      setGroupDetailsOpen(false);
      setGroupDetailsConversation(null);
      setGroupMembers([]);
      setSelectedId(conversations.find((item) => item.id !== group.id)?.id ?? defaultConversation.id);
      setNotice(t.groupDissolved);
    } catch (error) {
      setGroupError(extractErrorMessage(error, t.requestFailed));
    }
  }
  async function copyContactShortcut(user: SearchUser) {
    const conversation = conversationsRef.current.find((item) => item.type === "single" && item.otherUser?.id === user.id);
    if (!conversation) {
      setNotice(t.shortcutUnavailable);
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("conversation", conversation.id);
    try {
      await navigator.clipboard.writeText(url.toString());
      setNotice(t.shortcutCopied);
    } catch {
      setNotice(url.toString());
    }
  }

  function openSelectedDetails() {
    if (selected.type === "group") {
      openGroupDetails();
      return;
    }
    if (selectedContactUser) setContactDetailsUser(selectedContactUser);
  }

  function openConversationAvatarDetails(conversation: Conversation, event?: React.MouseEvent) {
    event?.preventDefault();
    event?.stopPropagation();
    if (conversation.type === "group") {
      openGroupDetails(conversation);
      return;
    }
    if (isSelfConversation(conversation) && currentUser) {
      setContactDetailsUser(currentUser);
      return;
    }
    if (conversation.otherUser) setContactDetailsUser(conversation.otherUser as SearchUser);
  }

  function openUserDetails(user?: (PublicUser & { email?: string | null; phone?: string | null }) | null) {
    if (!user) return;
    setContactDetailsUser(user as SearchUser);
  }

  function openContactHistory(user: SearchUser) {
    const conversation = conversationsRef.current.find((item) => item.type === "single" && (item.otherUser?.id === user.id || (user.id === currentUser?.id && isSelfConversation(item))));
    if (conversation) selectConversation(conversation.id);
    setMediaLibraryReturnDetails({ kind: "contact", user });
    setContactDetailsUser(null);
    setMediaLibraryView("history");
    setMediaLibraryScope("current");
    setMediaLibraryOpen(true);
  }

  function openGroupHistory(group: Conversation) {
    setMediaLibraryReturnDetails({ kind: "group", conversation: group });
    setGroupDetailsOpen(false);
    setGroupDetailsConversation(null);
    setMediaLibraryView("history");
    setMediaLibraryScope("current");
    setMediaLibraryOpen(true);
  }

  function closeMediaLibrary(restoreDetails = true) {
   const returnDetails = mediaLibraryReturnDetails;
    setMediaLibraryOpen(false);
   setMediaLibraryReturnDetails(null);
   if (!restoreDetails || !returnDetails) return;
    if (returnDetails.kind === "contact") setContactDetailsUser(returnDetails.user);
    else {
      setGroupDetailsConversation(returnDetails.conversation);
      setGroupDetailsOpen(true);
    }
  }

  function clearGroupMemberLongPressTimer() {
    if (groupMemberLongPressTimerRef.current) {
      window.clearTimeout(groupMemberLongPressTimerRef.current);
      groupMemberLongPressTimerRef.current = null;
    }
    groupMemberPressRef.current = null;
  }

  function openGroupMemberActionMenu(member: GroupMemberSummary, x: number, y: number, owner: boolean, manager: boolean) {
    const canChangeAdmin = owner && !member.isOwner;
    const canRemove = manager && !member.isOwner && member.user.id !== currentUser?.id;
    if (!canChangeAdmin && !canRemove) return;
    const menuWidth = 208;
    const menuHeight = canChangeAdmin && canRemove ? 150 : 104;
    setGroupMemberActionMenu({
      memberId: member.user.id,
      x: Math.max(12, Math.min(x, window.innerWidth - menuWidth - 12)),
      y: Math.max(12, Math.min(y, window.innerHeight - menuHeight - 12)),
    });
  }

  function handleGroupMemberPointerDown(event: ReactPointerEvent<HTMLDivElement>, member: GroupMemberSummary, owner: boolean, manager: boolean) {
    if (event.pointerType === "mouse") return;
    clearGroupMemberLongPressTimer();
    groupMemberLongPressTriggeredRef.current = false;
    const pointer = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    groupMemberPressRef.current = pointer;
    groupMemberLongPressTimerRef.current = window.setTimeout(() => {
      groupMemberLongPressTimerRef.current = null;
      groupMemberPressRef.current = null;
      groupMemberLongPressTriggeredRef.current = true;
      navigator.vibrate?.(30);
      openGroupMemberActionMenu(member, pointer.x, pointer.y, owner, manager);
    }, 620);
  }

  function handleGroupMemberPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const press = groupMemberPressRef.current;
    if (!press || press.pointerId !== event.pointerId) return;
    if (Math.abs(event.clientX - press.x) > 10 || Math.abs(event.clientY - press.y) > 10) clearGroupMemberLongPressTimer();
  }

  function handleGroupMemberContextMenu(event: React.MouseEvent<HTMLDivElement>, member: GroupMemberSummary, owner: boolean, manager: boolean) {
    event.preventDefault();
    clearGroupMemberLongPressTimer();
    openGroupMemberActionMenu(member, event.clientX, event.clientY, owner, manager);
  }

  function suppressGroupMemberClickAfterLongPress(event: React.MouseEvent<HTMLDivElement>) {
    if (!groupMemberLongPressTriggeredRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    groupMemberLongPressTriggeredRef.current = false;
  }

  async function removeMemberFromSelectedGroup(member: GroupMemberSummary) {
    const group = groupDetailsConversation ?? selected;
    if (group.type !== "group" || member.isOwner || groupMemberRemovingId) return;
    const memberName = displayUserName(member.user);
    if (!window.confirm(uiLabel(uiLanguage, { zh: `确认将“${memberName}”移出群聊？`, en: `Remove “${memberName}” from this group?`, hi: `“${memberName}” को इस समूह से हटाएं?` }))) return;
    setGroupMemberRemovingId(member.user.id);
    setGroupError("");
    try {
      const data = await apiJson<{ ok: true; conversation: ConversationSummary; members: GroupMemberSummary[] }>(`/conversations/${encodeURIComponent(group.id)}/members/${encodeURIComponent(member.user.id)}`, accessToken, { method: "DELETE" });
      const mapped = mapConversation(data.conversation);
      setGroupMembers(normalizeGroupMembers(data.members));
      setConversations((items) => items.map((item) => item.id === mapped.id ? { ...item, ...mapped } : item));
      setGroupDetailsConversation((current) => current?.id === mapped.id ? { ...current, ...mapped } : mapped);
      setNotice(uiLabel(uiLanguage, { zh: `已将“${memberName}”移出群聊。`, en: `${memberName} was removed from the group.`, hi: `${memberName} को समूह से हटा दिया गया।` }));
    } catch (error) {
      setGroupError(extractErrorMessage(error, uiLabel(uiLanguage, { zh: "移除群成员失败。", en: "Could not remove the group member.", hi: "समूह सदस्य को हटाया नहीं जा सका।" })));
    } finally {
      setGroupMemberRemovingId(null);
      setGroupMemberActionMenu(null);
    }
  }

  async function setSelectedGroupMemberAdmin(member: GroupMemberSummary, isAdmin: boolean) {
    const group = groupDetailsConversation ?? selected;
    if (group.type !== "group" || member.isOwner || groupAdminChangingId) return;
    const memberName = displayUserName(member.user);
    const actionLabel = isAdmin ? uiLabel(uiLanguage, { zh: "设为群管理员", en: "make a group administrator", hi: "समूह एडमिन बनाएं" }) : uiLabel(uiLanguage, { zh: "取消群管理员", en: "remove administrator access from", hi: "समूह एडमिन अधिकार हटाएं" });
    if (!window.confirm(uiLabel(uiLanguage, { zh: `确认${actionLabel}“${memberName}”？`, en: `Confirm to ${actionLabel} “${memberName}”?`, hi: `“${memberName}” को ${actionLabel}?` }))) return;
    setGroupAdminChangingId(member.user.id);
    setGroupError("");
    try {
      const data = await apiJson<{ ok: true; members: GroupMemberSummary[] }>(`/conversations/${encodeURIComponent(group.id)}/members/${encodeURIComponent(member.user.id)}/admin`, accessToken, { method: "PATCH", body: JSON.stringify({ isAdmin }) });
      setGroupMembers(normalizeGroupMembers(data.members));
      setNotice(isAdmin ? uiLabel(uiLanguage, { zh: `已将“${memberName}”设为群管理员。`, en: `${memberName} is now a group administrator.`, hi: `${memberName} अब समूह एडमिन हैं।` }) : uiLabel(uiLanguage, { zh: `已取消“${memberName}”的群管理员权限。`, en: `${memberName}'s administrator access was removed.`, hi: `${memberName} के एडमिन अधिकार हटा दिए गए।` }));
    } catch (error) {
      setGroupError(extractErrorMessage(error, uiLabel(uiLanguage, { zh: "群管理员设置失败。", en: "Could not update the group administrator.", hi: "समूह एडमिन अपडेट नहीं हो सका।" })));
    } finally {
      setGroupAdminChangingId(null);
      setGroupMemberActionMenu(null);
    }
  }

  async function submitPasswordReset(event: FormEvent) {
    event.preventDefault();
    setAuthError("");
    if (passwordResetNew.length < 8) {
      setAuthError(uiLabel(uiLanguage, { zh: "新密码至少需要 8 个字符。", en: "The new password must be at least 8 characters.", hi: "नया पासवर्ड कम से कम 8 अक्षरों का होना चाहिए।" }));
      return;
    }
    if (passwordResetNew !== passwordResetConfirm) {
      setAuthError(uiLabel(uiLanguage, { zh: "两次输入的新密码不一致。", en: "The two new passwords do not match.", hi: "दोनों नए पासवर्ड समान नहीं हैं।" }));
      return;
    }
    setPasswordResetSaving(true);
    try {
      await apiJson<{ ok: true }>("/auth/reset-password", "", { method: "POST", body: JSON.stringify({ token: passwordResetToken, newPassword: passwordResetNew }) });
      setPasswordResetToken("");
      setPasswordResetNew("");
      setPasswordResetConfirm("");
      if (typeof window !== "undefined") window.history.replaceState({}, "", window.location.pathname);
      setAuthCodeNotice(uiLabel(uiLanguage, { zh: "密码已重置，请使用新密码登录。", en: "Password reset. Sign in with your new password.", hi: "पासवर्ड रीसेट हो गया है। नए पासवर्ड से लॉगिन करें।" }));
    } catch (error) {
      setAuthError(extractErrorMessage(error, uiLabel(uiLanguage, { zh: "密码重置链接无效或已过期。", en: "The password reset link is invalid or expired.", hi: "पासवर्ड रीसेट लिंक अमान्य या समाप्त हो गया है।" })));
    } finally {
      setPasswordResetSaving(false);
    }
  }

  function renderContactDetails(user: SearchUser) {
    const isSelfContact = user.id === currentUser?.id;
    const fields = user.profilePublic === false ? [] : [
      [t.profileEmail, user.email],
      [t.profilePhone, user.phone],
      [t.profileCompany, user.company],
      [t.profileTitle, user.title],
      [t.profileLocation, user.location],
      [t.profileSignature, user.signature],
      [t.profileBio, user.bio]
    ].filter(([, value]) => typeof value === "string" && value.trim());
    return (
      <div className="fixed inset-0 z-[2147483647] overflow-y-auto bg-slate-950/45 p-4" onClick={() => setContactDetailsUser(null)}>
        <div className={`${detailModalCardClass} max-w-md`} onClick={(event) => event.stopPropagation()}>
          <div className={detailHeaderClass}>
            <p className="text-base font-semibold text-ink">{t.contactDetailsTitle}</p>
            <button className="rounded border border-line px-3 py-2 text-xs font-medium text-ink hover:border-brand" onClick={() => setContactDetailsUser(null)} type="button">{t.adminClose}</button>
         </div>
          <div className="min-h-0 flex-1 overflow-y-auto py-1 pr-1">
            <div className="flex flex-col">
          <div className={`order-first ${detailHeroClass}`}>
              <button className="shrink-0" onClick={() => user.avatarUrl ? setPreviewMedia({ url: normalizeMediaUrl(user.avatarUrl) ?? user.avatarUrl, type: "avatar", name: displayUserName(user) }) : null} type="button" aria-label={t.mediaOpen}>
              <Avatar name={displayUserName(user)} url={user.avatarUrl} size="lg" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-ink">{displayUserName(user)}{isSelfContact ? ` (${selfLabel})` : ""}</p>
              {contactRemarks[user.id]?.trim() ? <p className="truncate text-xs text-slate-500">{uiLabel(uiLanguage, { zh: "\u539f\u6635\u79f0", en: "Original name", hi: "मूल नाम" })}: {user.nickname}</p> : null}
              <p className="truncate text-sm text-slate-500">{user.publicId ? `ID: ${user.publicId}` : user.email ?? user.phone ?? user.id}</p>
            </div>
          </div>
          <section className="order-2 mt-4 rounded-2xl border border-brand/20 bg-brand/5 p-3 shadow-sm">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <button className={`${detailQuickActionClass} border-brand/30 bg-brand/10 text-brand hover:border-brand hover:bg-brand/20`} onClick={() => { setContactDetailsUser(null); void startDirectConversation(user); }} type="button" aria-label={t.openChat} title={t.openChat}>
                <MessageCircle size={22} />
                <span>{t.openChat}</span>
              </button>
              <button className={`${detailQuickActionClass} border-violet-200 bg-violet-50 text-violet-700 hover:border-violet-400 hover:bg-violet-100`} disabled={Boolean(activeCall)} onClick={() => void startContactCall(user, "audio")} type="button" aria-label={callLabels[uiLanguage].audioCall} title={callLabels[uiLanguage].audioCall}>
                <Phone size={22} />
                <span>{callLabels[uiLanguage].audioCall}</span>
              </button>
              <button className={`${detailQuickActionClass} border-sky-200 bg-sky-50 text-sky-700 hover:border-sky-400 hover:bg-sky-100`} disabled={Boolean(activeCall)} onClick={() => void startContactCall(user, "video")} type="button" aria-label={callLabels[uiLanguage].videoCall} title={callLabels[uiLanguage].videoCall}>
                <Video size={22} />
                <span>{callLabels[uiLanguage].videoCall}</span>
              </button>
              <button className={`${detailQuickActionClass} border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-400 hover:bg-amber-100`} onClick={() => openContactHistory(user)} type="button" aria-label={uiLabel(uiLanguage, { zh: "聊天记录", en: "Chat history", hi: "चैट इतिहास" })} title={uiLabel(uiLanguage, { zh: "聊天记录", en: "Chat history", hi: "चैट इतिहास" })}>
                <FileText size={22} />
                <span>{uiLabel(uiLanguage, { zh: "聊天记录", en: "Chat history", hi: "चैट इतिहास" })}</span>
              </button>
            </div>
          </section>
          <section className={`order-3 mt-4 ${detailSectionClass}`}>
            <p className="flex items-center gap-2 text-sm font-semibold text-ink"><FileText size={16} />{uiLabel(uiLanguage, { zh: "公开资料", en: "Profile details", hi: "प्रोफाइल विवरण" })}</p>
            <div className="mt-2 space-y-2 text-sm">
              {fields.length === 0 ? <p className="rounded-xl border border-line bg-paper px-3 py-3 text-slate-500">{t.contactDetailsEmpty}</p> : null}
              {fields.map(([label, value]) => (
                <div key={label} className="rounded-xl border border-line bg-white px-3 py-2">
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="mt-1 whitespace-pre-wrap text-ink">{value}</p>
                </div>
              ))}
            </div>
          </section>
          {isSelfContact ? (
            <div className="order-2 mt-4 space-y-3 rounded-2xl border border-brand/20 bg-brand/5 p-3 shadow-sm">
              <div className="flex flex-wrap gap-2">
                <input ref={contactAvatarFileInputRef} className="hidden" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleAvatarInputChange} />
                <button className="inline-flex items-center gap-2 rounded-2xl border border-line bg-white px-3 py-2 text-sm font-medium text-ink hover:border-brand disabled:opacity-60" disabled={avatarUploading} onClick={() => contactAvatarFileInputRef.current?.click()} type="button">{avatarUploading ? `${t.uploadingMedia} ${avatarUploadProgress}%` : uiLabel(uiLanguage, { zh: "修改头像", en: "Change avatar", hi: "अवतार बदलें" })}</button>
                <button className="inline-flex items-center gap-2 rounded-2xl border border-line bg-white px-3 py-2 text-sm font-medium text-ink hover:border-brand" onClick={() => { setContactDetailsUser(null); setFavoritesSendMode(false); setFavoritesOpen(true); void loadFavorites(); }} type="button"><Star size={16} />{uiLabel(uiLanguage, { zh: "我的收藏", en: "My favorites", hi: "मेरे पसंदीदा" })}</button>
              </div>
              <form className={profilePageSectionClass} onSubmit={handleSaveProfile}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-ink">{t.profileNickname}</p>
                  <div className="flex shrink-0 gap-2">
                    <button className="rounded-2xl border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-brand" onClick={() => { setProfileNotice(""); setProfileEditing(true); }} type="button">{uiLabel(uiLanguage, { zh: "\u4fee\u6539\u6635\u79f0", en: "Edit nickname", hi: "उपनाम बदलें" })}</button>
                    <button className="rounded bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-60" disabled={profileSaving || !profileEditing || profileNicknameValue.trim().length < 2} type="submit">{profileSaving ? "..." : t.saveProfile}</button>
                  </div>
                </div>
                <input className="mt-2 h-10 w-full rounded-2xl border border-line px-3 text-sm outline-none focus:border-brand disabled:bg-paper disabled:text-slate-500" disabled={!profileEditing} maxLength={60} value={profileNicknameValue} onChange={(event) => setProfileNicknameValue(event.target.value)} />
                {profileNotice ? <p className="mt-2 text-xs text-coral">{profileNotice}</p> : null}
              </form>
              <div className={profilePageSectionClass}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-ink">{t.profileSignature}</p>
                  <div className="flex shrink-0 gap-2">
                    <button className="rounded-2xl border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-brand" onClick={() => { setProfileNotice(""); setProfileSignatureEditing(true); }} type="button">{t.editSignature}</button>
                    <button className="rounded bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-60" disabled={profileSignatureSaving || !profileSignatureEditing} onClick={() => void handleSaveSignature()} type="button">{profileSignatureSaving ? "..." : t.saveSignature}</button>
                  </div>
                </div>
                <input className="mt-2 h-10 w-full rounded-2xl border border-line px-3 text-sm outline-none focus:border-brand disabled:bg-paper disabled:text-slate-500" disabled={!profileSignatureEditing} maxLength={160} value={profileSignature} onChange={(event) => setProfileSignature(event.target.value)} />
              </div>
            </div>
          ) : null}
          {!isSelfContact ? (
            <label className={`order-4 mt-4 block text-sm ${detailSectionClass}`}>
              <span className="text-xs font-medium text-slate-500">{uiLabel(uiLanguage, { zh: "备注名", en: "Remark name", hi: "रिमार्क नाम" })}</span>
              <input className="mt-1 h-9 w-full rounded border border-line px-3 text-sm outline-none focus:border-brand" maxLength={60} value={contactRemarks[user.id] ?? ""} onChange={(event) => updateContactRemark(user.id, event.target.value)} placeholder={user.nickname} />
            </label>
          ) : null}
           {!isSelfContact ? (
             <section className="order-5 mt-3 rounded-2xl border border-brand/20 bg-brand/5 p-3 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-ink"><Tag size={16} />{uiLabel(uiLanguage, { zh: "联系人标签", en: "Contact tags", hi: "संपर्क टैग" })}</p>
                <span className="text-xs text-slate-500">{(contactTags[user.id] ?? []).length}/20</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(contactTags[user.id] ?? []).map((tag) => (
                  <button key={tag} className="rounded-full bg-brand px-2.5 py-1 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-60" disabled={contactTagsSavingId === user.id} onClick={() => void saveContactTags(user.id, (contactTags[user.id] ?? []).filter((item) => item !== tag))} type="button" title={uiLabel(uiLanguage, { zh: "点击移除标签", en: "Remove tag", hi: "टैग हटाएं" })}>#{tag} ×</button>
                ))}
                {(contactTags[user.id] ?? []).length === 0 ? <span className="text-xs text-slate-500">{uiLabel(uiLanguage, { zh: "还没有标签", en: "No tags yet", hi: "अभी कोई टैग नहीं" })}</span> : null}
              </div>
              <div className="mt-3 flex gap-2">
                <input className="h-9 min-w-0 flex-1 rounded-xl border border-line bg-white px-3 text-sm outline-none focus:border-brand" maxLength={200} value={contactTagDraft} onChange={(event) => setContactTagDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void saveContactTags(user.id); } }} placeholder={uiLabel(uiLanguage, { zh: "输入标签，逗号或空格分隔", en: "Add tags, comma or space separated", hi: "टैग जोड़ें; कॉमा या स्पेस से अलग करें" })} />
                <button className="shrink-0 rounded-xl bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60" disabled={contactTagsSavingId === user.id || !contactTagDraft.trim()} onClick={() => void saveContactTags(user.id)} type="button">{contactTagsSavingId === user.id ? "..." : uiLabel(uiLanguage, { zh: "添加", en: "Add", hi: "जोड़ें" })}</button>
              </div>
              <p className="mt-2 text-xs text-slate-500">{uiLabel(uiLanguage, { zh: "标签会保存到账号，可用于后续权限分组。点击已有标签可移除。", en: "Tags are saved to your account for future permission groups. Click an existing tag to remove it.", hi: "टैग आपके खाते में सहेजे जाते हैं और आगे अनुमति समूहों में उपयोग किए जा सकते हैं। मौजूदा टैग हटाने के लिए उस पर क्लिक करें।" })}</p>
             </section>
           ) : null}
           {!isSelfContact ? (
             <section className={`order-6 mt-3 ${detailSectionClass}`}>
               <div className="flex items-center justify-between gap-3">
                 <p className="flex items-center gap-2 text-sm font-semibold text-ink"><StickyNote size={16} />{uiLabel(uiLanguage, { zh: "联系人备忘", en: "Contact memo", hi: "संपर्क नोट" })}</p>
                 <span className="text-xs text-slate-500">{contactMemoImagesDraft.length}/3</span>
               </div>
               <textarea className="mt-2 min-h-24 w-full resize-y rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand" maxLength={2000} value={contactMemoDraft} onChange={(event) => setContactMemoDraft(event.target.value)} placeholder={uiLabel(uiLanguage, { zh: "记录这个联系人的工作背景、权限说明或其他备忘", en: "Record work context, permission notes, or other private reminders", hi: "कार्य संदर्भ, अनुमति नोट या अन्य निजी रिमाइंडर लिखें" })} />
               <input ref={contactMemoFileInputRef} className="hidden" type="file" accept="image/*" multiple onChange={(event) => void handleContactMemoImageInput(event)} />
               {contactMemoImagesDraft.length > 0 ? (
                 <div className="mt-2 grid grid-cols-3 gap-2">
                   {contactMemoImagesDraft.map((image, index) => (
                     <div key={`${image.slice(0, 24)}-${index}`} className="relative aspect-square overflow-hidden rounded-xl border border-line bg-paper">
                       <button className="block h-full w-full" onClick={() => setPreviewMedia({ url: image, type: "image", name: `${displayUserName(user)} memo ${index + 1}` })} type="button" aria-label={t.mediaOpen}><img className="h-full w-full object-cover" src={image} alt="" /></button>
                       <button className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-slate-950/65 text-sm text-white hover:bg-coral" onClick={() => removeContactMemoImage(index)} type="button" aria-label={uiLabel(uiLanguage, { zh: "删除图片", en: "Remove image", hi: "चित्र हटाएं" })}>×</button>
                     </div>
                   ))}
                 </div>
               ) : null}
               <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                 <button className="rounded-xl border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink hover:border-brand disabled:opacity-60" disabled={contactMemoImageLoading || contactMemoImagesDraft.length >= 3} onClick={() => contactMemoFileInputRef.current?.click()} type="button">{contactMemoImageLoading ? "..." : uiLabel(uiLanguage, { zh: "添加图片", en: "Add images", hi: "चित्र जोड़ें" })}</button>
                 <button className="rounded-xl bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800" disabled={contactMemoSavingId === user.id} onClick={() => void saveContactMemo(user.id)} type="button">{uiLabel(uiLanguage, { zh: "保存备忘", en: "Save memo", hi: "नोट सहेजें" })}</button>
               </div>
               <p className="mt-2 text-xs text-slate-500">{uiLabel(uiLanguage, { zh: "备忘会同步到当前账号；图片最多 3 张。", en: "Memos sync to your account; up to 3 images are supported.", hi: "नोट आपके खाते में सिंक होते हैं; अधिकतम 3 चित्र समर्थित हैं।" })}</p>
             </section>
           ) : null}
          {!isSelfContact ? (
            <section className="order-7 mt-4 rounded-2xl border border-coral/30 bg-coral/5 p-3 shadow-sm">
              <p className="text-sm font-semibold text-coral">{uiLabel(uiLanguage, { zh: "联系人管理", en: "Contact management", hi: "संपर्क प्रबंधन" })}</p>
              <div className="mt-3 space-y-2">
                {(() => { const blocked = blockedUsers.some((block) => block.user.id === user.id); return <button aria-pressed={blocked} className="flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border border-line bg-white px-3 py-2 text-left hover:border-brand" onClick={() => blocked ? void unblockUser(user) : void blockUser(user)} type="button"><span><span className="block font-medium text-ink">{t.blockUser}</span><span className="block text-xs text-slate-500">{blocked ? t.unblockUser : t.blockUser}</span></span><BlockToggle checked={blocked} /></button>; })()}
                <div className="rounded-2xl border border-line bg-white/80 p-3 text-xs text-slate-500">
                  <label className="flex items-center gap-2 text-sm font-medium text-ink"><input className="h-4 w-4 accent-brand" type="checkbox" checked={removeContactClearHistory} onChange={(event) => setRemoveContactClearHistory(event.target.checked)} />{uiLanguage === "zh" ? "同时清空聊天记录" : uiLanguage === "hi" ? "चैट इतिहास भी साफ करें" : "Also clear chat history"}</label>
                  <p className="mt-1">{uiLanguage === "zh" ? "默认不勾选，删除联系人后仍保留聊天记录便于以后找回。" : uiLanguage === "hi" ? "डिफॉल्ट रूप से नहीं चुना है। संपर्क हटाने पर चैट इतिहास बना रहता है।" : "Unchecked by default. Removing a contact keeps chat history available for later recovery."}</p>
                  <button className="mt-3 w-full rounded-2xl border border-coral px-3 py-2 text-left text-sm font-medium text-coral hover:bg-coral/10" onClick={() => void removeFriend(user, removeContactClearHistory)} type="button">{t.removeFriend}</button>
                </div>
              </div>
            </section>
          ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  }


  function renderGroupDetails() {
    const group = groupDetailsConversation ?? (selected.type === "group" ? selected : null);
    if (!groupDetailsOpen || !group) return null;
    const owner = group.ownerId === currentUser?.id || groupMembers.some((member) => member.user.id === currentUser?.id && member.isOwner);
    const manager = owner || groupMembers.some((member) => member.user.id === currentUser?.id && member.isAdmin);
    const currentMemberIds = new Set(groupMembers.map((member) => member.user.id));
    const inviteCandidates = groupCandidateUsers.filter((user) => !currentMemberIds.has(user.id));
    return (
      <div className="fixed inset-0 z-[2147483646] overflow-y-auto bg-slate-950/45 p-4" onClick={() => { setGroupDetailsOpen(false); setGroupDetailsConversation(null); }}>
        <div className={`${detailModalCardClass} max-w-2xl`} onClick={(event) => event.stopPropagation()}>
          <div className={detailHeaderClass}>
            <p className="text-base font-semibold text-ink">{t.groupDetailsTitle}</p>
            <button className="rounded border border-line px-3 py-2 text-xs font-medium text-ink hover:border-brand" onClick={() => { setGroupDetailsOpen(false); setGroupDetailsConversation(null); }} type="button">{t.adminClose}</button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto py-1 pr-1">
            <div className={detailHeroClass}>
              <button className="shrink-0" onClick={() => group.avatarUrl ? setPreviewMedia({ url: normalizeMediaUrl(group.avatarUrl) ?? group.avatarUrl, type: "avatar", name: group.name }) : null} type="button" aria-label={t.mediaOpen}>
                <Avatar name={group.name} url={group.avatarUrl} size="lg" kind="group" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-semibold text-ink">{group.name}</p>
                <p className="text-sm text-slate-500">{group.memberCount ?? groupMembers.length} {t.groupMembers}</p>
              </div>
              {manager ? (
                <>
                  <input ref={groupAvatarInputRef} className="hidden" type="file" accept="image/*" onChange={handleGroupAvatarChange} />
                  <button className={detailSecondaryButtonClass} disabled={groupAvatarUploading} onClick={() => groupAvatarInputRef.current?.click()} type="button">{groupAvatarUploading ? "..." : t.groupAvatar}</button>
                </>
              ) : null}
            </div>
            <section className="mt-4 rounded-2xl border border-brand/20 bg-brand/5 p-3 shadow-sm">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <button className={`${detailQuickActionClass} border-brand/30 bg-brand/10 text-brand hover:border-brand hover:bg-brand/20`} onClick={() => { selectConversation(group.id); setGroupDetailsOpen(false); setGroupDetailsConversation(null); }} type="button" aria-label={t.openChat} title={t.openChat}>
                  <MessageCircle size={22} />
                  <span>{t.openChat}</span>
                </button>
                <button className={`${detailQuickActionClass} border-violet-200 bg-violet-50 text-violet-700 hover:border-violet-400 hover:bg-violet-100`} disabled={Boolean(activeCall)} onClick={() => { void openGroupCallPicker(group, "audio"); }} type="button" aria-label={callLabels[uiLanguage].audioCall} title={callLabels[uiLanguage].audioCall}>
                  <Phone size={22} />
                  <span>{callLabels[uiLanguage].audioCall}</span>
                </button>
                <button className={`${detailQuickActionClass} border-sky-200 bg-sky-50 text-sky-700 hover:border-sky-400 hover:bg-sky-100`} disabled={Boolean(activeCall)} onClick={() => { void openGroupCallPicker(group, "video"); }} type="button" aria-label={callLabels[uiLanguage].videoCall} title={callLabels[uiLanguage].videoCall}>
                  <Video size={22} />
                  <span>{callLabels[uiLanguage].videoCall}</span>
                </button>
                <button className={`${detailQuickActionClass} border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-400 hover:bg-amber-100`} onClick={() => openGroupHistory(group)} type="button" aria-label={uiLabel(uiLanguage, { zh: "\u804a\u5929\u8bb0\u5f55", en: "Chat history", hi: "\u091a\u0948\u091f \u0907\u0924\u093f\u0939\u093e\u0938" })} title={uiLabel(uiLanguage, { zh: "\u804a\u5929\u8bb0\u5f55", en: "Chat history", hi: "\u091a\u0948\u091f \u0907\u0924\u093f\u0939\u093e\u0938" })}>
                  <FileText size={22} />
                  <span>{uiLabel(uiLanguage, { zh: "\u804a\u5929\u8bb0\u5f55", en: "Chat history", hi: "\u091a\u0948\u091f \u0907\u0924\u093f\u0939\u093e\u0938" })}</span>
                </button>
              </div>
            </section>
            {group.announcement ? <p className={`mt-4 whitespace-pre-wrap text-sm text-ink ${detailSectionClass}`}>{group.announcement}</p> : null}
            {manager ? (
              <div className={`mt-4 space-y-3 ${detailSectionClass}`}>
                <label className="block text-sm font-medium text-ink">{t.groupTitle}<input className="mt-1 h-10 w-full rounded border border-line px-3 text-sm outline-none focus:border-brand" maxLength={80} value={groupTitleEditValue} onChange={(event) => setGroupTitleEditValue(event.target.value)} /></label>
                <label className="block text-sm font-medium text-ink">{t.groupAnnouncement}<textarea className="mt-1 min-h-24 w-full resize-y rounded border border-line px-3 py-2 text-sm outline-none focus:border-brand" maxLength={1000} value={groupAnnouncementValue} onChange={(event) => setGroupAnnouncementValue(event.target.value)} /></label>
                <label className="flex items-center gap-3 text-sm font-medium text-ink"><input className="h-4 w-4 accent-brand" type="checkbox" checked={groupAnnouncementScrollValue} onChange={(event) => setGroupAnnouncementScrollValue(event.target.checked)} /><span>{t.groupAnnouncementScroll}</span></label>
                <div className="flex flex-wrap gap-2">
                  <button className="rounded bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-teal-800" onClick={() => void saveSelectedGroupSettings()} type="button">{t.groupSaveSettings}</button>
                  <button className="rounded border border-coral px-3 py-2 text-sm font-medium text-coral hover:bg-coral/10" onClick={() => void dissolveSelectedGroup()} type="button">{t.groupDissolve}</button>
                </div>
              </div>
            ) : null}
            <label className={`mt-4 flex cursor-pointer items-center justify-between gap-4 ${detailSectionClass}`}>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink">{t.showSenderNames}</span>
                <span className="mt-1 block text-xs text-slate-500">{uiLabel(uiLanguage, { zh: "控制群聊消息气泡上方是否显示发信人名字。", en: "Choose whether sender names appear above group message bubbles.", hi: "समूह संदेशों के ऊपर भेजने वाले का नाम दिखाना चुनें।" })}</span>
              </span>
              <input className="h-5 w-5 shrink-0 accent-brand" checked={showSenderNames} onChange={(event) => setShowSenderNames(event.target.checked)} type="checkbox" />
            </label>
            <div className={`mt-4 overflow-hidden ${detailSectionClass}`}>
              <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2"><span className="text-sm font-semibold text-ink">{t.groupMembersList}</span>{manager ? <span className="text-[11px] text-slate-400">{uiLabel(uiLanguage, { zh: "长按或右键成员进行管理", en: "Press and hold or right-click to manage", hi: "प्रबंधित करने के लिए दबाकर रखें या राइट-क्लिक करें" })}</span> : null}</div>
              {groupMembersLoading ? <p className="px-3 py-3 text-sm text-slate-500">{t.searching}</p> : null}
              {groupMembers.map((member) => {
                const actionable = (owner && !member.isOwner) || (manager && !member.isOwner && member.user.id !== currentUser?.id);
                return <div
                  key={member.id}
                  className={`flex items-center gap-3 border-b border-line px-3 py-2 last:border-b-0 ${actionable ? "select-none hover:bg-paper/70" : ""}`}
                  data-group-member-row={member.user.id}
                  onClickCapture={suppressGroupMemberClickAfterLongPress}
                  onContextMenu={(event) => handleGroupMemberContextMenu(event, member, owner, manager)}
                  onPointerDown={(event) => handleGroupMemberPointerDown(event, member, owner, manager)}
                  onPointerMove={handleGroupMemberPointerMove}
                  onPointerUp={clearGroupMemberLongPressTimer}
                  onPointerLeave={clearGroupMemberLongPressTimer}
                  onPointerCancel={clearGroupMemberLongPressTimer}
                  style={{ touchAction: "pan-y" }}
                >
                  <button className="shrink-0" onClick={() => openUserDetails(member.user)} type="button" aria-label={t.viewContactDetails}><Avatar name={displayUserName(member.user)} url={member.user.avatarUrl} size="sm" /></button>
                  <div className="min-w-0 flex-1">
                    <button className="block max-w-full truncate text-left text-sm font-medium text-ink hover:text-brand" onClick={() => openUserDetails(member.user)} type="button">{displayUserName(member.user)} {member.isOwner ? `(${t.groupOwner})` : member.isAdmin ? `(${uiLabel(uiLanguage, { zh: "群管理员", en: "Administrator", hi: "एडमिन" })})` : ""}</button>
                    <p className="truncate text-xs text-slate-500">{member.invitedBy ? `${t.groupInvitedBy}: ${displayUserName(member.invitedBy)}` : ""}</p>
                  </div>
                  {actionable ? <span className="shrink-0 text-lg leading-none text-slate-300" aria-hidden="true">⋮</span> : null}
                </div>;
              })}
            </div>
            {groupMemberActionMenu ? (() => {
              const member = groupMembers.find((item) => item.user.id === groupMemberActionMenu.memberId);
              if (!member) return null;
              const canChangeAdmin = owner && !member.isOwner;
              const canRemove = manager && !member.isOwner && member.user.id !== currentUser?.id;
              return typeof document !== "undefined" ? createPortal(<div className="fixed inset-0 z-[2147483647]" onClick={(event) => { event.stopPropagation(); setGroupMemberActionMenu(null); }} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); setGroupMemberActionMenu(null); }} role="presentation">
                <div className="fixed w-52 overflow-hidden rounded-2xl border border-line bg-white p-1.5 shadow-2xl" style={{ left: groupMemberActionMenu.x, top: groupMemberActionMenu.y }} data-group-member-action-menu={member.user.id} onClick={(event) => event.stopPropagation()} role="menu" aria-label={uiLabel(uiLanguage, { zh: `${displayUserName(member.user)}的成员管理菜单`, en: `Member actions for ${displayUserName(member.user)}`, hi: `${displayUserName(member.user)} के सदस्य विकल्प` })}>
                  <p className="truncate border-b border-line px-3 py-2 text-xs font-semibold text-slate-500">{displayUserName(member.user)}</p>
                  {canChangeAdmin ? <button className="flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm font-medium text-brand hover:bg-brand/10 disabled:opacity-50" disabled={groupAdminChangingId === member.user.id} onClick={() => void setSelectedGroupMemberAdmin(member, !member.isAdmin)} role="menuitem" type="button">{groupAdminChangingId === member.user.id ? "..." : member.isAdmin ? uiLabel(uiLanguage, { zh: "取消管理员", en: "Remove admin", hi: "एडमिन हटाएं" }) : uiLabel(uiLanguage, { zh: "设为管理员", en: "Make admin", hi: "एडमिन बनाएं" })}</button> : null}
                  {canRemove ? <button className="flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm font-medium text-coral hover:bg-coral/10 disabled:opacity-50" disabled={groupMemberRemovingId === member.user.id} onClick={() => void removeMemberFromSelectedGroup(member)} role="menuitem" type="button">{groupMemberRemovingId === member.user.id ? "..." : uiLabel(uiLanguage, { zh: "移出群聊", en: "Remove from group", hi: "समूह से हटाएं" })}</button> : null}
                </div>
              </div>, document.body) : null;
            })() : null}
            <div className={`mt-4 ${detailSectionClass}`}>
              <p className="text-sm font-semibold text-ink">{t.groupInviteMembers}</p><p className="mt-1 text-xs text-slate-500">{t.groupInviteHint}</p>
              <div className="mt-3 max-h-56 overflow-auto rounded-2xl border border-line bg-white">
                {inviteCandidates.length === 0 ? <p className="px-3 py-4 text-sm text-slate-500">{t.groupNoInviteCandidates}</p> : null}
                {inviteCandidates.map((user) => { const checked = groupInviteSelectedIds.includes(user.id); return <label key={user.id} className="flex cursor-pointer items-center gap-3 border-b border-line px-3 py-2 last:border-b-0 hover:bg-paper"><input className="h-4 w-4 accent-brand" type="checkbox" checked={checked} onChange={() => toggleInviteMember(user.id)} /><button className="shrink-0" onClick={(event) => { event.preventDefault(); event.stopPropagation(); openUserDetails(user); }} type="button" aria-label={t.viewContactDetails}><Avatar name={displayUserName(user)} url={user.avatarUrl} size="sm" /></button><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-ink">{displayUserName(user)}</span><span className="block truncate text-xs text-slate-500">{user.email ?? user.phone ?? user.id}</span></span></label>; })}
              </div>
              <button className="mt-3 h-10 w-full rounded bg-brand text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60" disabled={groupInviteSaving || groupInviteSelectedIds.length < 1} onClick={() => void inviteMembersToSelectedGroup()} type="button">{groupInviteSaving ? "..." : t.groupInviteMembers}</button>
            </div>
            {groupError ? <p className="mt-3 rounded border border-coral/30 bg-coral/10 px-3 py-2 text-sm text-coral">{groupError}</p> : null}
          </div>
        </div>
      </div>
    );
  }
  function renderGroupModal() {
    if (!groupModalOpen) return null;
    return (
      <div className="fixed inset-0 z-[2147483645] bg-slate-950/45 p-4" onClick={() => setGroupModalOpen(false)}>
        <div className="mx-auto mt-10 w-full max-w-md rounded bg-white p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
          <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
            <p className="text-base font-semibold text-ink">{t.createGroup}</p>
            <button className="rounded border border-line px-3 py-2 text-xs font-medium text-ink hover:border-brand" onClick={() => setGroupModalOpen(false)} type="button">{t.adminClose}</button>
          </div>
          <label className="mt-4 block text-sm font-medium text-ink">
            {t.groupTitle}
            <input className="mt-1 h-10 w-full rounded border border-line px-3 text-sm outline-none focus:border-brand" maxLength={80} value={groupTitleValue} onChange={(event) => setGroupTitleValue(event.target.value)} />
          </label>
          <div className="mt-4">
            <p className="text-sm font-medium text-ink">{t.groupMembers}</p>
            <p className="mt-1 text-xs text-slate-500">{t.groupCreateHint}</p>
            <div className="mt-3 max-h-72 overflow-auto rounded border border-line">
              {groupCandidateUsers.length === 0 ? <p className="px-3 py-4 text-sm text-slate-500">{t.groupNoFriends}</p> : null}
              {groupCandidateUsers.map((friend) => {
                const checked = groupSelectedIds.includes(friend.id);
                return (
                  <label key={friend.id} className="flex cursor-pointer items-center gap-3 border-b border-line px-3 py-2 last:border-b-0 hover:bg-paper">
                    <input className="h-4 w-4 accent-brand" type="checkbox" checked={checked} onChange={() => toggleGroupMember(friend.id)} />
                    <Avatar name={displayUserName(friend)} url={friend.avatarUrl} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{displayUserName(friend)}</span>
                      <span className="block truncate text-xs text-slate-500">{friend.email ?? friend.phone ?? friend.id}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
          {groupError ? <p className="mt-3 rounded border border-coral/30 bg-coral/10 px-3 py-2 text-sm text-coral">{groupError}</p> : null}
          <button className="mt-4 h-10 w-full rounded bg-brand text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60" disabled={groupCreating} onClick={() => void createGroupConversation()} type="button">
            {groupCreating ? "..." : t.createGroup}
          </button>
        </div>
      </div>
    );
  }
  if (!currentUser) {
    const loginHeadline = uiLabel(uiLanguage, { zh: "让跨语言聊天从登录开始就清爽可信。", en: "A cleaner sign-in for every cross-language chat.", hi: "हर भाषा की बातचीत के लिए साफ और भरोसेमंद प्रवेश।" });
    const loginLead = uiLabel(uiLanguage, { zh: "一个入口完成登录、注册和语言选择，适合国内用户、海外客户与印度团队共同使用。", en: "One entry point for sign-in, account creation, and language choice across local teams, overseas clients, and India partners.", hi: "लॉगिन, नया खाता और भाषा चयन एक ही जगह, स्थानीय टीम, विदेशी ग्राहक और भारतीय सहयोगियों के लिए।" });
    const isPasswordResetMode = Boolean(passwordResetToken);
    const formTitle = isPasswordResetMode
      ? uiLabel(uiLanguage, { zh: "设置新密码", en: "Set a new password", hi: "नया पासवर्ड सेट करें" })
      : authMode === "login"
        ? uiLabel(uiLanguage, { zh: "欢迎回来", en: "Welcome back", hi: "फिर से स्वागत है" })
        : uiLabel(uiLanguage, { zh: "创建新账号", en: "Create your account", hi: "नया खाता बनाएं" });
    const formSub = isPasswordResetMode
      ? uiLabel(uiLanguage, { zh: "请输入至少 8 位的新密码，保存后即可返回登录。", en: "Enter a new password with at least 8 characters, then sign in again.", hi: "कम से कम 8 अक्षरों का नया पासवर्ड दर्ज करें और फिर लॉगिन करें।" })
      : authMode === "login"
        ? uiLabel(uiLanguage, { zh: "登录后继续查看最近会话、翻译记录和文件消息。", en: "Continue with recent chats, translations, files, and saved contacts.", hi: "हाल की चैट, अनुवाद रिकॉर्ड और फाइल संदेश जारी रखें।" })
        : uiLabel(uiLanguage, { zh: "注册后即可设置默认语言，开始添加联系人并创建群聊。", en: "Set your default language, add contacts, and start secure conversations.", hi: "डिफॉल्ट भाषा सेट करें, संपर्क जोड़ें और सुरक्षित बातचीत शुरू करें।" });
    const primaryLabel = isPasswordResetMode
      ? uiLabel(uiLanguage, { zh: "保存新密码", en: "Save new password", hi: "नया पासवर्ड सहेजें" })
      : authMode === "login"
        ? uiLabel(uiLanguage, { zh: "登录 Glimpse Chat", en: "Sign in to Glimpse Chat", hi: "Glimpse Chat में लॉगिन करें" })
        : uiLabel(uiLanguage, { zh: "注册 Glimpse Chat", en: "Create Glimpse Chat account", hi: "Glimpse Chat खाता बनाएं" });
    return (
      <main className="min-h-screen bg-[linear-gradient(135deg,#f7fbfb,#e8f2f4_54%,#f8f6ee)] px-0 py-0 text-ink sm:px-5 sm:py-7">
        <section className="mx-auto grid min-h-screen w-full overflow-hidden border border-white/80 bg-white/60 shadow-2xl sm:min-h-[720px] sm:max-w-6xl sm:rounded-[28px] lg:grid-cols-[1.05fr_0.86fr]">
          <aside className="relative order-2 flex min-h-[360px] flex-col justify-between overflow-hidden bg-[linear-gradient(145deg,rgba(5,62,75,0.96),rgba(13,127,140,0.86))] p-6 text-white sm:min-h-[430px] sm:p-8 lg:order-1">
            <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(90deg,rgba(255,255,255,.22)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,.22)_1px,transparent_1px)] [background-size:34px_34px]" />
            <div className="relative flex items-center gap-3">
              <img className="h-14 w-14 rounded-2xl bg-white object-contain p-1.5" src="/glimpse-logo-login.png" alt="Glimpse Chat" />
              <div className="min-w-0">
                <p className="truncate text-xl font-semibold">Glimpse Chat</p>
                <p className="mt-1 text-xs text-white/70">{uiLabel(uiLanguage, { zh: "多语言即时沟通平台", en: "Multilingual messaging workspace", hi: "बहुभाषी चैट कार्यक्षेत्र" })}</p>
              </div>
            </div>
            <div className="relative mt-12 max-w-xl pb-2 sm:mt-16">
              <div className="inline-flex min-h-9 items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 text-xs font-semibold text-white shadow-sm">
                <span className="h-2 w-2 rounded-full bg-[#b9df72] shadow-[0_0_0_6px_rgba(185,223,114,.16)]" />
                {uiLabel(uiLanguage, { zh: "中文 / English / हिन्दी 即时切换", en: "Chinese / English / Hindi switching", hi: "चीनी / English / हिन्दी स्विच" })}
              </div>
              <h1 className="mt-5 max-w-2xl text-4xl font-semibold leading-tight tracking-normal sm:text-5xl">{loginHeadline}</h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-white/75">{loginLead}</p>
              <div className="mt-7 grid max-w-xl gap-3">
                <div className="rounded-2xl border border-white/20 bg-white/10 p-4 shadow-lg">
                  <div className="flex justify-between text-xs text-white/65"><span>Priya</span><span>09:42</span></div>
                  <div className="mt-3 rounded-xl bg-white px-4 py-3 text-sm leading-6 text-ink">
                    क्या आप आज报价 भेज सकते हैं?
                    <span className="mt-2 block border-t border-brand/15 pt-2 text-xs font-semibold text-brand">{uiLabel(uiLanguage, { zh: "可以今天发送报价吗？", en: "Can you send the quotation today?", hi: "क्या आप आज报价 भेज सकते हैं?" })}</span>
                  </div>
                </div>
                <div className="rounded-2xl border border-white/20 bg-white/10 p-4 shadow-lg">
                  <div className="flex justify-between text-xs text-white/65"><span>Daniel</span><span>09:45</span></div>
                  <div className="mt-3 rounded-xl bg-white px-4 py-3 text-sm leading-6 text-ink">
                    The sample photos are ready for review.
                    <span className="mt-2 block border-t border-brand/15 pt-2 text-xs font-semibold text-brand">{uiLabel(uiLanguage, { zh: "样品照片已经准备好，请查看。", en: "The sample photos are ready for review.", hi: "नमूना फोटो समीक्षा के लिए तैयार हैं।" })}</span>
                  </div>
                </div>
              </div>
            </div>
          </aside>
          <section className="order-1 flex flex-col justify-between gap-6 bg-white/80 p-5 sm:p-7 lg:order-2">
            <div className="flex items-center justify-start gap-3 pt-1 lg:hidden">
              <img className="h-12 w-12 rounded-2xl bg-white object-contain p-1.5 shadow-sm ring-1 ring-line" src="/glimpse-logo-login.png" alt="Glimpse Chat" />
              <div className="min-w-0">
                <p className="truncate text-2xl font-semibold leading-tight text-ink">Glimpse Chat</p>
                <p className="mt-1 text-xs font-medium text-slate-500">{uiLabel(uiLanguage, { zh: "多语言即时沟通平台", en: "Multilingual messaging workspace", hi: "बहुभाषी चैट कार्यक्षेत्र" })}</p>
              </div>
            </div>
            <nav className="flex flex-wrap justify-center gap-2 sm:justify-end" aria-label={authText.language}>
              {authLanguageOptions.map((item) => (
                <button key={item.code} type="button" aria-label={item.label} title={item.label} className={`min-h-10 min-w-[76px] rounded-full border px-3 text-sm font-semibold transition ${uiLanguage === item.code ? "border-brand bg-brand text-white shadow-lg shadow-teal-900/10" : "border-line bg-white/80 text-slate-600 hover:border-brand hover:text-brand"}`} onClick={() => setUiLanguage(item.code)}>
                  {item.label}
                </button>
              ))}
            </nav>
            <section className="mx-auto w-full max-w-md rounded-3xl border border-white bg-white/90 p-5 shadow-xl sm:p-6">
              {!isPasswordResetMode ? (
                <div className="grid grid-cols-2 gap-2 rounded-2xl border border-line bg-paper p-1 text-sm">
                  <button type="button" className={`h-11 rounded-xl font-semibold transition ${authMode === "login" ? "bg-white text-brand shadow-sm" : "text-slate-600 hover:text-ink"}`} onClick={() => setAuthMode("login")}>{authText.login}</button>
                  <button type="button" className={`h-11 rounded-xl font-semibold transition ${authMode === "register" ? "bg-white text-brand shadow-sm" : "text-slate-600 hover:text-ink"}`} onClick={() => setAuthMode("register")}>{authText.register}</button>
                </div>
              ) : null}
              <h2 className="mt-6 text-3xl font-semibold leading-tight text-ink">{formTitle}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-500">{formSub}</p>
              <form className="mt-6 space-y-4" onSubmit={isPasswordResetMode ? submitPasswordReset : submitAuth}>
                {isPasswordResetMode ? (
                  <>
                    <label className="block text-sm font-semibold text-ink">
                      {uiLabel(uiLanguage, { zh: "新密码", en: "New password", hi: "नया पासवर्ड" })}
                      <span className="mt-2 flex min-h-13 items-center gap-3 rounded-2xl border border-line bg-white px-4 text-slate-400 focus-within:border-brand">
                        <Check size={17} />
                        <input className="w-full bg-transparent py-3 text-ink outline-none placeholder:text-slate-400" autoComplete="new-password" type="password" placeholder={uiLabel(uiLanguage, { zh: "输入至少 8 位密码", en: "Enter at least 8 characters", hi: "कम से कम 8 अक्षर दर्ज करें" })} value={passwordResetNew} onChange={(event) => setPasswordResetNew(event.target.value)} />
                      </span>
                    </label>
                    <label className="block text-sm font-semibold text-ink">
                      {uiLabel(uiLanguage, { zh: "确认新密码", en: "Confirm new password", hi: "नए पासवर्ड की पुष्टि करें" })}
                      <span className="mt-2 flex min-h-13 items-center gap-3 rounded-2xl border border-line bg-white px-4 text-slate-400 focus-within:border-brand">
                        <Check size={17} />
                        <input className="w-full bg-transparent py-3 text-ink outline-none placeholder:text-slate-400" autoComplete="new-password" type="password" placeholder={uiLabel(uiLanguage, { zh: "再次输入新密码", en: "Enter it again", hi: "फिर से दर्ज करें" })} value={passwordResetConfirm} onChange={(event) => setPasswordResetConfirm(event.target.value)} />
                      </span>
                    </label>
                  </>
                ) : (
                  <>
                    {authMode === "register" ? (
                      <label className="block text-sm font-semibold text-ink">
                        {authText.nickname}
                        <span className="mt-2 flex min-h-13 items-center gap-3 rounded-2xl border border-line bg-white px-4 text-slate-400 focus-within:border-brand">
                          <Users size={17} />
                          <input className="w-full bg-transparent py-3 text-ink outline-none placeholder:text-slate-400" autoComplete="nickname" placeholder={uiLabel(uiLanguage, { zh: "请输入昵称", en: "Enter your name", hi: "अपना नाम लिखें" })} value={authNickname} onChange={(event) => setAuthNickname(event.target.value)} />
                        </span>
                      </label>
                    ) : null}
                    <label className="block text-sm font-semibold text-ink">
                      {authText.email}
                      <span className="mt-2 flex min-h-13 items-center gap-3 rounded-2xl border border-line bg-white px-4 text-slate-400 focus-within:border-brand">
                        <MessageCircle size={17} />
                        <input className="w-full bg-transparent py-3 text-ink outline-none placeholder:text-slate-400" autoComplete="email" autoCapitalize="none" spellCheck={false} required type="email" inputMode="email" placeholder={uiLabel(uiLanguage, { zh: "请输入邮箱地址", en: "Enter your email address", hi: "अपना ईमेल पता दर्ज करें" })} value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} />
                      </span>
                    </label>
                    {authMode === "register" ? (
                      <label className="block text-sm font-semibold text-ink">
                        {uiLabel(uiLanguage, { zh: "邮箱验证码", en: "Email verification code", hi: "ईमेल सत्यापन कोड" })}
                        <span className="mt-2 flex min-h-13 items-center gap-2 rounded-2xl border border-line bg-white px-4 text-slate-400 focus-within:border-brand">
                          <Check size={17} />
                          <input className="min-w-0 flex-1 bg-transparent py-3 text-ink outline-none placeholder:text-slate-400" autoComplete="one-time-code" inputMode="numeric" maxLength={6} placeholder={uiLabel(uiLanguage, { zh: "输入6位验证码", en: "Enter 6-digit code", hi: "6 अंकों का कोड लिखें" })} value={authVerificationCode} onChange={(event) => setAuthVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))} />
                          <button className="shrink-0 rounded-xl border border-line px-3 py-2 text-xs font-semibold text-brand hover:border-brand disabled:opacity-60" disabled={authCodeSending || !authEmail.trim()} onClick={sendAuthVerificationCode} type="button">
                            {authCodeSending ? uiLabel(uiLanguage, { zh: "发送中", en: "Sending", hi: "भेजा जा रहा है" }) : uiLabel(uiLanguage, { zh: "发送验证码", en: "Send code", hi: "कोड भेजें" })}
                          </button>
                        </span>
                        {authCodeNotice ? <span className="mt-2 block text-xs font-medium text-brand">{authCodeNotice}</span> : null}
                      </label>
                    ) : null}
                    <label className="block text-sm font-semibold text-ink">
                      {authText.password}
                      <span className="mt-2 flex min-h-13 items-center gap-3 rounded-2xl border border-line bg-white px-4 text-slate-400 focus-within:border-brand">
                        <Check size={17} />
                        <input className="w-full bg-transparent py-3 text-ink outline-none placeholder:text-slate-400" autoComplete={authMode === "login" ? "current-password" : "new-password"} type="password" placeholder={uiLabel(uiLanguage, { zh: "输入密码", en: "Enter password", hi: "पासवर्ड लिखें" })} value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} />
                      </span>
                    </label>
                  </>
                )}
                {authError ? <p className="rounded-2xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">{authError}</p> : null}
                {authCodeNotice && (isPasswordResetMode || authMode === "login") ? <p className="rounded-2xl border border-brand/20 bg-brand/5 px-4 py-3 text-sm text-brand">{authCodeNotice}</p> : null}
                {isPasswordResetMode ? (
                  <button className="text-left text-xs font-semibold text-brand hover:underline" type="button" onClick={() => { setPasswordResetToken(""); setAuthError(""); if (typeof window !== "undefined") window.history.replaceState({}, "", window.location.pathname); }}>
                    {uiLabel(uiLanguage, { zh: "返回登录", en: "Back to sign in", hi: "लॉगिन पर वापस जाएं" })}
                  </button>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-2"><span className="grid h-5 w-5 place-items-center rounded-md bg-brand text-xs text-white">✓</span>{uiLabel(uiLanguage, { zh: "记住登录状态", en: "Keep me signed in", hi: "लॉगिन याद रखें" })}</span>
                    <button className="font-semibold text-brand hover:underline" type="button" onClick={() => void requestForgotPassword()}>
                      {uiLabel(uiLanguage, { zh: "忘记密码？", en: "Forgot password?", hi: "पासवर्ड भूल गए?" })}
                    </button>
                  </div>
                )}
                <button className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#0f7f8c,#0b5f6a)] px-4 font-semibold text-white shadow-lg shadow-teal-900/20 hover:bg-teal-800 disabled:opacity-60" disabled={isPasswordResetMode ? passwordResetSaving : authLoading} type="submit">
                  {(isPasswordResetMode ? passwordResetSaving : authLoading) ? authText.pleaseWait : primaryLabel}<span aria-hidden="true">→</span>
                </button>
              </form>
            </section>
            <p className="mx-auto max-w-md text-center text-xs leading-6 text-slate-500">{uiLabel(uiLanguage, { zh: "登录异常提醒、设备管理和会话保护可在登录后继续管理。", en: "Unusual login alerts, device management, and session protection continue inside account settings.", hi: "असामान्य लॉगिन सूचना, डिवाइस प्रबंधन और चैट सुरक्षा सेटिंग्स में प्रबंधित की जा सकती हैं।" })}</p>
          </section>
        </section>
      </main>
    );
  }
  const selectedScreenshotTextAnnotation = screenshotAnnotations.find((annotation): annotation is ScreenshotTextAnnotation => annotation.id === screenshotSelectedAnnotationId && annotation.kind === 'text');
  const selectedScreenshotTextBounds = selectedScreenshotTextAnnotation ? screenshotTextBounds(selectedScreenshotTextAnnotation) : null;
  return (
    <main className="h-[100dvh] overflow-hidden bg-[linear-gradient(135deg,#f7fbfb,#e8f2f4_54%,#f8f6ee)] p-0 pt-[env(safe-area-inset-top,0px)] text-ink lg:p-7">
      <GlimpseAssistant open={assistantOpen} onClose={() => setAssistantOpen(false)} apiUrl={getApiUrl()} accessToken={accessToken} userId={currentUser.id} uiLanguage={uiLanguage} onSendGeneratedFile={sendAssistantGeneratedFile} />
      <style>{`@keyframes glimpse-group-announcement-marquee { 0% { transform: translateX(100%); } 100% { transform: translateX(-100%); } } @keyframes glimpse-continuous-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } } .glimpse-continuous-marquee { animation-name: glimpse-continuous-marquee; animation-timing-function: linear; animation-iteration-count: infinite; will-change: transform; } @media (prefers-reduced-motion: reduce) { .glimpse-continuous-marquee { animation: none !important; } } @keyframes glimpse-panel-enter { from { opacity: 0; transform: translateY(12px) scale(.985); } to { opacity: 1; transform: translateY(0) scale(1); } } .glimpse-inner-panel { animation: glimpse-panel-enter .28s cubic-bezier(.2,.8,.2,1); }`}</style>
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[1440px] flex-col overflow-hidden border border-white/80 bg-white/60 shadow-[0_28px_90px_rgba(22,54,65,0.18)] backdrop-blur-xl lg:h-[calc(100dvh-3.5rem)] lg:rounded-[30px] lg:flex-row">
        <aside className={`${mobilePane === "chat" ? "hidden lg:flex" : "flex"} ${adminModalOpen ? "relative z-[80]" : ""} max-h-[100dvh] w-full shrink-0 flex-col overflow-hidden border-b border-white/50 bg-white/80 backdrop-blur-xl lg:max-h-none lg:min-h-0 lg:w-[390px] lg:border-b-0 lg:border-r lg:border-white/60`}>
          <header className="flex min-h-[76px] items-center gap-3 border-b border-white/70 bg-white/70 px-4 backdrop-blur-xl">
            <div className="min-w-0 flex-1">
              <div className="min-w-0 select-none"><span className="flex items-center gap-2"><button className="inline-block max-w-full truncate p-0 text-left text-xl font-semibold text-ink" onClick={handleTitleClick} type="button" title={uiLabel(uiLanguage, { zh: "打开欢迎页", en: "Open welcome page", hi: "स्वागत पेज खोलें" })}>Glimpse Chat</button><OnlineDot online={ownOnline} size="md" /></span><span className="block max-w-[13rem] overflow-hidden whitespace-nowrap text-xs text-slate-500 sm:max-w-[18rem]" title={uiLabel(uiLanguage, activeSlogan)}><span className="inline-block min-w-full glimpse-slogan-marquee">{uiLabel(uiLanguage, activeSlogan)}</span></span></div>

            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button aria-label="Switch language" className="grid h-11 w-11 place-items-center rounded-2xl border border-line bg-white text-ink shadow-sm transition hover:-translate-y-0.5 hover:border-brand hover:text-brand" onClick={() => setUiLanguage((value) => nextUiLanguage(value))} title="Switch language">
                <Languages size={18} />
              </button>
              <button aria-label={t.settings} className="grid h-11 w-11 place-items-center rounded-2xl border border-line bg-white text-ink shadow-sm transition hover:-translate-y-0.5 hover:border-brand hover:text-brand" onClick={() => setSettingsOpen((value) => !value)} title={t.settings}>
                <Settings size={18} />
              </button>
            </div>
          </header>

          {settingsOpen ? (
            <div className="glimpse-inner-panel max-h-[calc(100dvh-76px)] overflow-y-auto rounded-b-[28px] border-b border-white/80 bg-white/85 px-4 py-4 shadow-sm backdrop-blur-xl">
              <div className="mb-4 flex items-start justify-between gap-3 border-b border-line pb-3">
                <div>
                  <p className="text-base font-semibold text-ink">{t.settings}</p>
                  <p className="mt-1 text-xs text-slate-500">{uiLabel(uiLanguage, { zh: "语言、消息、通知与账号安全", en: "Language, messaging, notifications, and account security", hi: "भाषा, संदेश, सूचनाएं और खाता सुरक्षा" })}</p>
                </div>
                <span className="rounded-full bg-brand/10 px-2.5 py-1 text-[11px] font-semibold text-brand">{GLIMPSE_CHAT_VERSION}</span>
              </div>
              <label className="block text-xs font-medium text-slate-500">
                {t.translationTarget}
                <select className="mt-1 h-11 w-full rounded-2xl border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10" value={translationTargetLanguage} onChange={(event) => { translationTargetLanguagePreferenceRef.current = true; setTranslationTargetLanguage(event.target.value as TranslationLanguage); }}>
                  {TRANSLATION_LANGUAGE_OPTIONS.map((item) => (
                    <option key={item.code} value={item.code}>
                      {translationLanguageLabelForUi(item, uiLanguage)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-3 block text-xs font-medium text-slate-500">
                {t.displayMode}
                <select className="mt-1 h-11 w-full rounded-2xl border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10" value={messageDisplayMode} onChange={(event) => setMessageDisplayMode(event.target.value as MessageDisplayMode)}>
                  <option value="original">{t.originalOnly}</option>
                  <option value="translated">{t.translatedOnly}</option>
                  <option value="bilingual">{t.bilingual}</option>
                </select>
              </label>
              <label className="mt-3 block text-xs font-medium text-slate-500">
                {ttsConfig.provider === "aliyun_bailian" ? uiLabel(uiLanguage, { zh: "百炼朗读音色", en: "Bailian voice", hi: "Bailian वॉइस" }) : ttsConfig.provider === "doubao" ? uiLabel(uiLanguage, { zh: "豆包朗读音色", en: "Doubao voice", hi: "Doubao वॉइस" }) : t.speechAccent}
                {["doubao", "aliyun_bailian"].includes(ttsConfig.provider) ? (
                  <select className="mt-1 h-11 w-full rounded-2xl border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10" data-tts-voice-select="true" value={selectedTtsVoiceType || (ttsConfig.provider === "aliyun_bailian" ? ttsConfig.aliyun.voiceType : ttsConfig.doubao.voiceType)} onChange={(event) => selectTtsVoiceType(event.target.value)}>
                    {((ttsConfig.provider === "aliyun_bailian" ? ttsConfig.aliyun.voices : ttsConfig.doubao.voices).length ? (ttsConfig.provider === "aliyun_bailian" ? ttsConfig.aliyun.voices : ttsConfig.doubao.voices) : [{ value: ttsConfig.provider === "aliyun_bailian" ? ttsConfig.aliyun.voiceType : ttsConfig.doubao.voiceType, label: ttsConfig.provider === "aliyun_bailian" ? ttsConfig.aliyun.voiceType : ttsConfig.doubao.voiceType }]).map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                ) : (
                  <select className="mt-1 h-11 w-full rounded-2xl border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10" value={speechAccent} onChange={(event) => setSpeechAccent(event.target.value as SpeechAccent)}>
                    {speechAccentOptions.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.code === "auto" ? t.speechAccentAuto : item.label}
                      </option>
                    ))}
                  </select>
                )}
                <span className="mt-1 block text-[11px] font-normal text-slate-400">{ttsConfig.provider === "aliyun_bailian" ? uiLabel(uiLanguage, { zh: `当前由后台百炼 ${ttsConfig.aliyun.model} 配置控制，支持印地语。`, en: `Controlled by backend Bailian ${ttsConfig.aliyun.model}; Hindi is supported.`, hi: `बैकएंड Bailian ${ttsConfig.aliyun.model} द्वारा नियंत्रित; हिंदी समर्थित है।` }) : ttsConfig.provider === "doubao" ? uiLabel(uiLanguage, { zh: "当前由后台豆包 TTS 配置控制。", en: "Controlled by backend Doubao TTS settings.", hi: "वर्तमान में बैकएंड Doubao TTS सेटिंग उपयोग हो रही है." }) : uiLabel(uiLanguage, { zh: "当前使用浏览器内置朗读。", en: "Using browser built-in speech synthesis.", hi: "वर्तमान में ब्राउज़र अंतर्निहित वाचन उपयोग हो रहा है." })}</span>
              </label>
              <div className={`mt-4 space-y-2 ${profilePageSectionClass}`}>
                <label className="flex items-start gap-3 text-sm text-ink">
                  <input className="mt-1 h-4 w-4 accent-brand" type="checkbox" checked={notificationsEnabled} onChange={(event) => updateNotificationsEnabled(event.target.checked)} />
                  <span>
                    <span className="block font-medium">{t.notifications}</span>
                    <span className="block text-xs text-slate-500">{t.notificationsHint}</span>
                  </span>
                </label>
                <label className="flex items-center gap-3 text-sm text-ink">
                  <input className="h-4 w-4 accent-brand" type="checkbox" checked={notificationSoundEnabled} disabled={!notificationsEnabled} onChange={(event) => setNotificationSoundEnabled(event.target.checked)} />
                  <span>{t.notificationSound}</span>
                </label>
                <label className="flex items-center gap-3 text-sm text-ink">
                  <input className="h-4 w-4 accent-brand" type="checkbox" checked={notificationVibrationEnabled} disabled={!notificationsEnabled} onChange={(event) => setNotificationVibrationEnabled(event.target.checked)} />
                  <span>{t.notificationVibration}</span>
                </label>
                <p className="text-xs text-slate-500">{t.notificationPermission}</p>
              </div>
              <form className={`mt-4 space-y-2 ${profilePageSectionClass}`} onSubmit={handleChangePassword}>
                <p className="text-sm font-medium text-ink">{t.changePasswordTitle}</p>
                <input className="h-10 w-full rounded-2xl border border-line bg-white px-3 text-sm text-ink outline-none focus:border-brand" type="password" autoComplete="current-password" placeholder={t.currentPassword} value={changePasswordCurrent} onChange={(event) => setChangePasswordCurrent(event.target.value)} />
                <input className="h-10 w-full rounded-2xl border border-line bg-white px-3 text-sm text-ink outline-none focus:border-brand" type="password" autoComplete="new-password" placeholder={t.newPassword} value={changePasswordNew} onChange={(event) => setChangePasswordNew(event.target.value)} />
                <input className="h-10 w-full rounded-2xl border border-line bg-white px-3 text-sm text-ink outline-none focus:border-brand" type="password" autoComplete="new-password" placeholder={t.confirmPassword} value={changePasswordConfirm} onChange={(event) => setChangePasswordConfirm(event.target.value)} />
                <button className="h-10 w-full rounded bg-brand text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60" disabled={changePasswordSaving || !changePasswordCurrent || !changePasswordNew || !changePasswordConfirm} type="submit">
                  {changePasswordSaving ? "..." : t.updatePassword}
                </button>
              </form>
              <div className={`mt-3 text-xs text-slate-500 ${profilePageSectionClass}`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <span className="block font-medium text-ink">{uiLabel(uiLanguage, { zh: "关于", en: "About", hi: "के बारे में" })}</span>
                    <span>{uiLabel(uiLanguage, { zh: "打开欢迎页和快速入口。", en: "Open welcome page and quick links.", hi: "स्वागत पेज और त्वरित प्रवेश खोलें." })}</span>
                  </div>
                  <button className="rounded-2xl border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink hover:border-brand" type="button" onClick={openWelcomePage}>{uiLabel(uiLanguage, { zh: "打开", en: "Open", hi: "खोलें" })}</button>
                </div>
              </div>
            </div>
          ) : null}
          <div className="border-b border-white/70 bg-white/65 p-3">
            <label className="flex h-11 items-center gap-2 rounded-2xl border border-line bg-white/80 px-3 text-sm text-slate-500">
              <Search size={18} />
              <input className="min-w-0 flex-1 bg-transparent text-ink outline-none" placeholder={uiLabel(uiLanguage, { zh: "全局搜索聊天、联系人、收藏", en: "Search chats, contacts, messages, favorites", hi: "चैट, संपर्क, संदेश और पसंदीदा खोजें" })} value={globalQuery} onChange={(event) => setGlobalQuery(event.target.value)} />{globalQuery ? <button className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-paper hover:text-ink" onClick={() => setGlobalQuery("")} type="button" aria-label={uiLabel(uiLanguage, { zh: "清空搜索", en: "Clear search", hi: "खोज साफ करें" })}>×</button> : null}
            </label>
          </div>
          <nav className="grid grid-cols-5 gap-1.5 border-b border-white/70 bg-white/65 px-2.5 py-2 text-xs backdrop-blur-xl">
            <TabButton active={tab === "chats"} onClick={() => { setSettingsOpen(false); setGlobalQuery(""); setTab("chats"); }} onDoubleClick={jumpToLatestUnreadOrBottom} icon={<MessageCircle size={17} />} label={t.chats} />
            <TabButton active={tab === "contacts"} onClick={() => { setSettingsOpen(false); setGlobalQuery(""); setTab("contacts"); }} icon={<Users size={17} />} label={t.contacts} />
            <TabButton active={tab === "meetings"} onClick={() => { setSettingsOpen(false); setGlobalQuery(""); setTab("meetings"); }} icon={<Video size={17} />} label={meetingLabel} />
            <TabButton active={tab === "moments"} onClick={() => { setSettingsOpen(false); setGlobalQuery(""); setTab("moments"); }} icon={<Globe2 size={17} />} label={uiLabel(uiLanguage, { zh: "朋友圈", en: "Moments", hi: "मोमेंट्स" })} />
            <TabButton active={tab === "me"} onClick={() => { setSettingsOpen(false); setGlobalQuery(""); setTab("me"); }} icon={<Users size={17} />} label={t.me} />
          </nav>
          <section className="min-h-0 flex-1 overflow-auto bg-white/40 px-3 py-3">
            {notice && (tab !== "me" || !profileNotice) ? <div className="glimpse-notice-fade border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800" role="status">{localizeNoticeMessage(notice, uiLanguage)}</div> : null}
            {globalSearchActive ? (
              <div className="space-y-3">
                <div className="px-4 py-3 text-xs font-semibold uppercase text-slate-500">{uiLabel(uiLanguage, { zh: "全局搜索结果", en: "Global search results", hi: "वैश्विक खोज परिणाम" })}</div>
                {globalSearchResults.length === 0 ? <p className="px-4 py-6 text-sm text-slate-500">{t.empty}</p> : null}
                {[
                  { key: "message", label: uiLabel(uiLanguage, { zh: "聊天记录", en: "Chat history", hi: "चैट इतिहास" }), matches: globalSearchResults.filter((result) => result.kind === "message") },
                  { key: "contact", label: uiLabel(uiLanguage, { zh: "联系人", en: "Contacts", hi: "संपर्क" }), matches: globalSearchResults.filter((result) => result.kind === "contact") },
                  { key: "group", label: uiLabel(uiLanguage, { zh: "群聊", en: "Group chats", hi: "समूह चैट" }), matches: globalSearchResults.filter((result) => result.kind === "conversation" && result.avatarKind === "group") },
                  { key: "conversation", label: uiLabel(uiLanguage, { zh: "聊天", en: "Chats", hi: "चैट" }), matches: globalSearchResults.filter((result) => result.kind === "conversation" && result.avatarKind !== "group") },
                  { key: "favorite", label: uiLabel(uiLanguage, { zh: "收藏", en: "Favorites", hi: "पसंदीदा" }), matches: globalSearchResults.filter((result) => result.kind === "favorite") },
                ].filter((section) => section.matches.length > 0).map((section) => (
                  <div key={section.key} className="space-y-2">
                    <div className="px-4 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{section.label}</div>
                    {section.matches.map((result) => (
                      <button key={result.id} className="flex w-full items-center gap-3 rounded-3xl border border-line bg-white px-3 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-md" onClick={() => openGlobalSearchResult(result)} type="button">
                        <Avatar name={displayGlobalSearchName(result)} url={result.avatarUrl} kind={result.avatarKind === "group" ? "group" : "user"} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate font-medium text-ink">{displayGlobalSearchName(result)}</p>
                            <span className="shrink-0 rounded bg-paper px-1.5 py-0.5 text-[11px] text-slate-500">{section.label}</span>
                          </div>
                          <p className="truncate text-sm text-slate-500">{result.subtitle}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            ) : tab === "chats" ? (
              conversationsLoading && conversations.length === 0 ? (
                <p className="px-4 py-6 text-sm text-slate-500">{t.loadingConversations}</p>
              ) : conversationsFailed && conversations.length === 0 ? (
                <div className="space-y-3 px-4 py-6 text-sm text-slate-500">
                  <p>{t.conversationsFailed}</p>
                  <button className="rounded border border-line px-3 py-2 font-medium text-ink hover:border-brand" onClick={() => void loadConversations()} type="button">
                    {messageActionLabels[uiLanguage].retry}
                  </button>
                </div>
              ) : filtered.length > 0 ? (
                filtered.map((item) => (
                  <button key={item.id} className={`flex w-full items-center gap-3 rounded-3xl border px-3 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${item.id === selected.id ? "border-brand/20 bg-brand/10" : "border-line bg-white hover:border-brand/30"}`} onClick={(event) => { if (conversationLongPressTriggeredRef.current) { event.preventDefault(); conversationLongPressTriggeredRef.current = false; return; } selectConversation(item.id); }} onContextMenu={(event) => handleConversationContextMenu(event, item.id)} onPointerDown={(event) => handleConversationPointerDown(event, item.id)} onPointerUp={clearConversationLongPressTimer} onPointerLeave={clearConversationLongPressTimer} onPointerCancel={clearConversationLongPressTimer}>
                    <span className="relative shrink-0" role="button" tabIndex={0} onClick={(event) => openConversationAvatarDetails(item, event)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") openConversationAvatarDetails(item, event as unknown as React.MouseEvent); }}><Avatar name={displayConversationName(item)} url={item.type === "single" && isSelfConversation(item) ? ownAvatarUrl : item.avatarUrl} kind={item.type === "group" ? "group" : "user"} />{item.type === "single" ? <OnlineDot online={Boolean(item.online)} className="absolute -bottom-0.5 -right-0.5 ring-2 ring-white" /> : null}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="flex min-w-0 items-center gap-2 font-medium text-ink"><span className="truncate">{pinnedConversationIds.has(item.id) ? `${uiLabel(uiLanguage, { zh: "置顶", en: "Top", hi: "शीर्ष" })} · ` : ""}{displayConversationName(item)}</span>{isSelfConversation(item) ? <span className="shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-brand">{selfLabel}</span> : null}</p>
                        <span className="shrink-0 text-xs text-slate-500">{item.time}</span>
                      </div>
                      <p className="truncate text-sm text-slate-500">{isSelfConversation(item) ? selfLabel + " · " : ""}{item.preview}</p>
                    </div>
                    {item.unread > 0 ? <UnreadBadge count={item.unread} /> : null}
                  </button>
                ))
              ) : (
                <p className="px-4 py-6 text-sm text-slate-500">{conversations.length === 0 ? t.noConversations : t.empty}</p>
              )
            ) : null}

            {!globalSearchActive && tab === "contacts" ? (
              <div className="space-y-2">
                <button className="flex w-full items-center gap-3 rounded-3xl border border-brand/20 bg-gradient-to-r from-teal-700 to-cyan-600 px-4 py-4 text-left text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-lg" onClick={() => setAssistantOpen(true)} type="button">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/15"><Bot size={25} /></span>
                  <span className="min-w-0 flex-1"><span className="block font-semibold">{uiLabel(uiLanguage, { zh: "Glimpse 智能助手", en: "Glimpse Assistant", hi: "Glimpse सहायक" })}</span><span className="mt-0.5 block text-xs text-white/80">{uiLabel(uiLanguage, { zh: "直接对话 · 文件翻译 · 按提示处理", en: "Chat · translate files · follow your instructions", hi: "बातचीत · फ़ाइल अनुवाद · निर्देशानुसार कार्य" })}</span></span>
                  <ArrowUpRight size={19} />
                </button>
                <div className="space-y-3 rounded-3xl border border-line bg-white p-4 text-sm text-slate-500 shadow-sm">
                  <p>{t.contactHint}</p>
                  <label className="flex h-10 items-center gap-2 rounded-2xl border border-line bg-white px-3 text-sm text-slate-500">
                    <Search size={16} />
                    <input className="min-w-0 flex-1 bg-transparent text-ink outline-none" placeholder={uiLabel(uiLanguage, { zh: "搜索邮箱、手机号、昵称或ID添加联系人", en: "Search email, phone, nickname, or ID to add", hi: "ईमेल, फोन, उपनाम या ID से संपर्क जोड़ें" })} value={contactQuery} onChange={(event) => setContactQuery(event.target.value)} />{contactQuery ? <button className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-paper hover:text-ink" onClick={() => setContactQuery("")} type="button" aria-label={uiLabel(uiLanguage, { zh: "清空搜索", en: "Clear search", hi: "खोज साफ करें" })}>×</button> : null}
                  </label>
                  <button className="inline-flex h-11 items-center gap-2 rounded-2xl bg-brand px-4 text-sm font-semibold text-white shadow-sm hover:bg-teal-800 disabled:opacity-60" onClick={() => { setNotice(""); setGroupError(""); setGroupModalOpen(true); }} type="button">
                    <Users size={16} />{t.createGroup}
                  </button>
                  <button className="inline-flex h-11 items-center gap-2 rounded-2xl border border-line bg-white px-4 text-sm font-semibold text-ink shadow-sm hover:border-brand" onClick={() => setNotice(t.meetingComing)} type="button">
                    <Video size={16} />{meetingLabel}
                  </button>
                </div>
                {contactQuery.trim().length < 2 && blockedUsers.length > 0 ? (
                  <div className="rounded-3xl border border-line bg-white p-4 shadow-sm">
                    <p className="mb-2 text-xs font-semibold uppercase text-slate-500">{t.blockedUsersTitle}</p>
                    <div className="space-y-1">
                      {blockedUsers.map((block) => (
                        <button key={block.id} className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition hover:bg-brand/10" onClick={() => void unblockUser(block.user)} type="button">
                          <span role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); setContactDetailsUser(block.user); }}><Avatar name={displayUserName(block.user)} url={block.user.avatarUrl} /></span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-ink">{displayUserName(block.user)}</p>
                            <p className="truncate text-sm text-slate-500">{block.user.email ?? block.user.phone ?? block.user.id}</p>
                          </div>
                          <BlockToggle checked={true} />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {contactQuery.trim().length < 2 ? (
                  <div className="rounded-3xl border border-line bg-white p-4 shadow-sm">
                    <p className="mb-2 text-xs font-semibold uppercase text-slate-500">{t.friendsTitle}</p>
                    {contactTagOptions.length > 0 ? (
                      <div className="mb-3" aria-label={uiLabel(uiLanguage, { zh: "按联系人标签筛选", en: "Filter contacts by tag", hi: "संपर्क टैग से फ़िल्टर करें" })}>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Tag size={14} className="text-slate-400" />
                          <button className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${contactTagFilters.length === 0 ? "bg-brand text-white" : "border border-line bg-white text-slate-500"}`} aria-pressed={contactTagFilters.length === 0} onClick={() => setContactTagFilters([])} type="button">{uiLabel(uiLanguage, { zh: "全部", en: "All", hi: "सभी" })}</button>
                          <button className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${contactTagPanelOpen || contactTagFilters.length > 0 ? "bg-brand text-white" : "border border-line bg-white text-brand"}`} aria-expanded={contactTagPanelOpen} onClick={() => setContactTagPanelOpen((open) => !open)} type="button">{uiLabel(uiLanguage, { zh: "标签", en: "Tags", hi: "टैग" })}{contactTagFilters.length > 0 ? ` (${contactTagFilters.length})` : ""}</button>
                          {contactTagFilters.length > 0 ? <span className="text-[11px] text-slate-500">{uiLabel(uiLanguage, { zh: `已选 ${contactTagFilters.length}`, en: `${contactTagFilters.length} selected`, hi: `${contactTagFilters.length} चुने गए` })}</span> : null}
                        </div>
                        {contactTagPanelOpen ? (
                          <div className="mt-2 flex flex-wrap gap-1.5 rounded-2xl border border-line bg-paper/60 p-2">
                            {contactTagOptions.map((tag) => {
                              const selected = contactTagFilters.some((item) => item.toLocaleLowerCase() === tag.toLocaleLowerCase());
                              return <button key={tag} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${selected ? "bg-brand text-white" : "border border-line bg-white text-brand"}`} aria-pressed={selected} onClick={() => toggleContactTagFilter(tag)} type="button">#{tag}</button>;
                            })}
                            <button className="rounded-full border border-line bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500 hover:border-brand hover:text-brand" onClick={() => setContactTagFilters([])} type="button">{uiLabel(uiLanguage, { zh: "清除筛选", en: "Clear filters", hi: "फ़िल्टर साफ करें" })}</button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {friendDataLoading ? <p className="py-4 text-sm text-slate-500">{t.searching}</p> : null}
                    {friendDataError ? (
                      <div className="rounded-2xl border border-coral/30 bg-coral/10 px-3 py-3 text-sm text-coral">
                        <p>{friendDataError}</p>
                        <button className="mt-2 rounded-xl border border-coral/40 px-3 py-1.5 text-xs font-medium hover:bg-coral/10" onClick={() => void loadFriendData()} type="button">{messageActionLabels[uiLanguage].retry}</button>
                      </div>
                    ) : null}
                    {!friendDataLoading && !friendDataError && contactListFriends.length === 0 ? <p className="py-4 text-sm text-slate-500">{contactTagFilters.length > 0 ? uiLabel(uiLanguage, { zh: "没有匹配所选标签的联系人", en: "No contacts match the selected tags", hi: "चुने गए टैग से कोई संपर्क मेल नहीं खाता" }) : t.empty}</p> : null}
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1 space-y-2">
                      {contactInitialGroups.map(({ initial, users }) => (
                        <section key={initial} id={`contact-initial-${initial === "#" ? "other" : initial}`}>
                          <p className="px-3 pt-1 text-xs font-semibold uppercase tracking-wider text-slate-400">{initial}</p>
                          <div className="space-y-1">
                      {users.map((friend) => {
                        const editingRemark = editingContactRemarkId === friend.id;
                        return (
                          <div key={friend.id} className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition hover:bg-brand/10" data-contact-row={friend.id} onContextMenu={(event) => friend.id !== currentUser?.id && openContactActionMenu(event, friend.id)}>
                            <button className="relative shrink-0" onClick={() => setContactDetailsUser(friend)} type="button" aria-label={t.viewContactDetails}><Avatar name={displayUserName(friend)} url={friend.avatarUrl} /><OnlineDot online={Boolean(friend.online)} className="absolute -bottom-0.5 -right-0.5 ring-2 ring-white" /></button>
                            <button className="min-w-0 flex-1 text-left" onClick={() => !editingRemark && setContactDetailsUser(friend)} type="button">
                              {editingRemark ? (
                                <input autoFocus className="h-9 w-full rounded-2xl border border-brand bg-white px-3 text-sm font-medium text-ink outline-none" maxLength={60} value={contactRemarks[friend.id] ?? ""} onBlur={() => setEditingContactRemarkId("")} onChange={(event) => updateContactRemark(friend.id, event.target.value)} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === "Enter" || event.key === "Escape") { event.preventDefault(); setEditingContactRemarkId(""); } }} placeholder={friend.nickname} />
                              ) : (
                                <p className="flex min-w-0 items-center gap-2 font-medium text-ink"><span className="truncate">{displayUserName(friend)}</span>{(contactTags[friend.id] ?? []).includes(STARRED_CONTACT_TAG) ? <Star className="shrink-0 fill-amber-400 text-amber-500" size={14} aria-label={uiLabel(uiLanguage, { zh: "星标联系人", en: "Starred contact", hi: "तारांकित संपर्क" })} /> : null}{friend.id === currentUser?.id ? <span className="shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-brand">{selfLabel}</span> : null}</p>
                              )}
                              <p className="truncate text-sm text-slate-500">{friend.email ?? friend.phone ?? friend.id}</p>
                            </button>
                            {friend.id !== currentUser?.id ? <button className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-line bg-white text-slate-500 shadow-sm hover:border-brand hover:text-brand" onClick={() => setEditingContactRemarkId(friend.id)} title={uiLabel(uiLanguage, { zh: "\u4fee\u6539\u5907\u6ce8", en: "Edit remark", hi: "रिमार्क बदलें" })} aria-label={uiLabel(uiLanguage, { zh: "\u4fee\u6539\u5907\u6ce8", en: "Edit remark", hi: "रिमार्क बदलें" })} type="button"><Type size={17} /></button> : null}
                          </div>
                        );
                      })}
                          </div>
                        </section>
                      ))}
                      </div>
                      {contactInitialGroups.length > 0 ? (
                        <nav className="sticky top-2 flex max-h-[52vh] shrink-0 flex-col items-center gap-0.5 overflow-auto rounded-full bg-paper/80 px-1 py-1 text-[10px] font-semibold text-brand" aria-label={uiLabel(uiLanguage, { zh: "联系人首拼音导航", en: "Contact initial navigation", hi: "संपर्क अक्षर नेविगेशन" })}>
                          {contactInitialGroups.map(({ initial }) => <button key={initial} className="grid h-5 w-5 place-items-center rounded-full hover:bg-brand hover:text-white" onClick={() => document.getElementById(`contact-initial-${initial === "#" ? "other" : initial}`)?.scrollIntoView({ behavior: "smooth", block: "start" })} type="button">{initial}</button>)}
                        </nav>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {contactsLoading ? <p className="px-4 py-4 text-sm text-slate-500">{t.searching}</p> : null}
                {!contactsLoading && contactQuery.trim().length >= 2 && contactResults.length === 0 ? <p className="px-4 py-4 text-sm text-slate-500">{t.empty}</p> : null}
                {contactQuery.trim().length >= 2
                  ? contactResults.map((user) => {
                      const isKnownFriend = visibleFriends.some((friend) => friend.id === user.id) || user.id === currentUser?.id;
                      return (
                      <div key={user.id} className="flex w-full items-center gap-3 rounded-3xl border border-line bg-white px-3 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-md">
                        <button className="relative shrink-0" onClick={() => setContactDetailsUser(user)} type="button" aria-label={t.viewContactDetails}><Avatar name={displayUserName(user)} url={user.avatarUrl} /><OnlineDot online={Boolean(user.online)} className="absolute -bottom-0.5 -right-0.5 ring-2 ring-white" /></button>
                        <button className="min-w-0 flex-1 text-left" onClick={() => setContactDetailsUser(user)} type="button">
                          <p className="flex min-w-0 items-center gap-2 font-medium text-ink"><span className="truncate">{displayUserName(user)}</span>{user.id === currentUser?.id ? <span className="shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-brand">{selfLabel}</span> : null}</p>
                          <p className="truncate text-sm text-slate-500">{user.email ?? user.phone ?? user.id}</p>
                        </button>
                        {user.id !== currentUser?.id ? <button className={`grid h-10 w-10 place-items-center rounded-2xl border shadow-sm hover:border-brand ${isKnownFriend ? "border-brand/20 bg-brand/10 text-brand" : "border-line bg-white text-brand"}`} onClick={() => void saveContact(user)} title={isKnownFriend ? uiLabel(uiLanguage, { zh: "已是联系人", en: "Already a contact", hi: "पहले से संपर्क" }) : t.addFriend} aria-label={isKnownFriend ? uiLabel(uiLanguage, { zh: "已是联系人", en: "Already a contact", hi: "पहले से संपर्क" }) : t.addFriend} type="button">
                          <UserPlus size={18} />
                        </button> : null}
                      </div>
                    ); })
                  : null}
              </div>
            ) : null}


            {!globalSearchActive && tab === "meetings" ? (
              <div className="space-y-3">
                <div className="rounded-3xl border border-line bg-white p-4 shadow-sm">
                  <p className="flex items-center gap-2 font-semibold text-ink"><Video size={18} />{meetingLabel}</p>
                  <p className="mt-1 text-sm text-slate-500">{uiLabel(uiLanguage, { zh: "这里预留类似腾讯会议和 Teams 的会议工作区，后续会接入预约会议、即时会议、参会人、会议资料和录制记录。", en: "Reserved for a meeting workspace combining scheduled meetings, instant calls, participants, files, and recordings.", hi: "यह मीटिंग कार्यक्षेत्र के लिए आरक्षित है: शेड्यूल मीटिंग, तुरंत कॉल, प्रतिभागी, फाइलें और रिकॉर्डिंग." })}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[uiLabel(uiLanguage, { zh: "开始会议", en: "Start meeting", hi: "मीटिंग शुरू करें" }), uiLabel(uiLanguage, { zh: "预约会议", en: "Schedule meeting", hi: "मीटिंग शेड्यूल करें" }), uiLabel(uiLanguage, { zh: "会议记录", en: "Meeting records", hi: "मीटिंग रिकॉर्ड" }), uiLabel(uiLanguage, { zh: "会议文件", en: "Meeting files", hi: "मीटिंग फाइलें" })].map((label) => <button key={label} className="rounded-3xl border border-dashed border-line bg-white/80 px-4 py-3 text-left text-sm font-medium text-slate-600 shadow-sm hover:border-brand" onClick={() => setNotice(t.meetingComing)} type="button">{label}<span className="mt-1 block text-xs font-normal text-slate-400">{uiLabel(uiLanguage, { zh: "后续接入", en: "Coming later", hi: "जल्द आएगा" })}</span></button>)}
                </div>
              </div>
            ) : null}

            {!globalSearchActive && tab === "moments" ? (
              <div className="space-y-3">
                <div className="rounded-3xl border border-line bg-white p-4 shadow-sm">
                  <p className="font-semibold text-ink">{uiLabel(uiLanguage, { zh: "朋友圈", en: "Moments", hi: "मोमेंट्स" })}</p>
                  <p className="mt-1 text-sm text-slate-500">{uiLabel(uiLanguage, { zh: "这里预留朋友圈动态、公司公告、客户资料更新和互动入口。", en: "Reserved for moments, company updates, customer activity, and social interactions.", hi: "यह मोमेंट्स, कंपनी अपडेट, ग्राहक गतिविधि और इंटरैक्शन के लिए आरक्षित है." })}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    uiLabel(uiLanguage, { zh: "发布动态", en: "Post moment", hi: "मोमेंट पोस्ट करें" }),
                    uiLabel(uiLanguage, { zh: "客户动态", en: "Customer updates", hi: "ग्राहक अपडेट" }),
                    uiLabel(uiLanguage, { zh: "公司公告", en: "Company news", hi: "कंपनी समाचार" }),
                    uiLabel(uiLanguage, { zh: "点赞与评论", en: "Likes and comments", hi: "लाइक और टिप्पणी" })
                  ].map((label) => <button key={label} className="rounded-3xl border border-dashed border-line bg-white/80 px-4 py-3 text-left text-sm font-medium text-slate-600 shadow-sm hover:border-brand" onClick={() => setNotice(uiLabel(uiLanguage, { zh: `${label} 将在后续版本接入。`, en: `${label} will be connected in a later version.`, hi: `${label} बाद के संस्करण में जोड़ा जाएगा.` }))} type="button">{label}<span className="mt-1 block text-xs font-normal text-slate-400">{uiLabel(uiLanguage, { zh: "后续接入", en: "Coming later", hi: "बाद में" })}</span></button>)}
                </div>
              </div>
            ) : null}
            {adminModalOpen || (!globalSearchActive && tab === "me") ? (
              <div className="space-y-4 p-1 sm:p-2">
                 <form className={profilePageCardClass} onSubmit={handleSaveProfile}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <button className="shrink-0" onClick={() => (profileAvatarPreviewUrl || profileAvatarUrl || ownAvatarUrl) ? setPreviewMedia({ url: normalizeMediaUrl(profileAvatarPreviewUrl || profileAvatarUrl || ownAvatarUrl) ?? (profileAvatarPreviewUrl || profileAvatarUrl || ownAvatarUrl), type: "avatar", name: profileNicknameValue || currentUser?.nickname || "User" }) : null} type="button" aria-label={t.mediaOpen}><Avatar name={profileNicknameValue || currentUser?.nickname || "User"} url={profileAvatarPreviewUrl || profileAvatarUrl || ownAvatarUrl} /></button>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink">{profileNicknameValue || currentUser?.nickname}</p>
                        <p className="truncate text-sm text-slate-500">{profileSignature || (profilePublicId ? `ID: ${profilePublicId}` : currentUser?.email || currentUser?.phone || currentUser?.id)}</p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-col gap-3">
                     <div className="order-1 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-white/80 p-3 shadow-sm">
                      <input ref={avatarFileInputRef} className="hidden" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleAvatarInputChange} />
                       <button className="inline-flex h-10 items-center justify-center rounded-2xl border border-line bg-white px-3 text-sm font-medium text-ink hover:border-brand disabled:opacity-60" disabled={avatarUploading} onClick={() => avatarFileInputRef.current?.click()} type="button">
                        {avatarUploading ? `${t.uploadingMedia} ${avatarUploadProgress}%` : t.uploadAvatar}
                      </button>
                       <button className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-line bg-white px-3 text-sm font-medium text-ink hover:border-brand" onClick={() => { setFavoritesSendMode(false); setFavoritesOpen(true); void loadFavorites(); }} type="button">
                        <Star size={16} />{uiLabel(uiLanguage, { zh: "我的收藏", en: "My favorites", hi: "मेरे पसंदीदा" })}
                      </button>
                    </div>
                     <div className="order-2 rounded-2xl border border-line bg-white/80 p-3 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                         <p className="text-sm font-semibold text-ink">{t.profileSignature}</p>
                        <div className="flex shrink-0 gap-2">
                           <button className="inline-flex h-10 items-center justify-center rounded-2xl border border-line bg-white px-3 text-sm font-medium text-ink hover:border-brand" onClick={() => { setProfileNotice(""); setProfileSignatureEditing(true); }} type="button">{t.editSignature}</button>
                           <button className="inline-flex h-10 items-center justify-center rounded-2xl bg-brand px-3 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60" disabled={profileSignatureSaving || !profileSignatureEditing} onClick={() => void handleSaveSignature()} type="button">{profileSignatureSaving ? "..." : t.saveSignature}</button>
                        </div>
                      </div>
                      <input className="mt-2 h-10 w-full rounded-2xl border border-line bg-white px-3 text-sm outline-none focus:border-brand disabled:bg-paper disabled:text-slate-500" disabled={!profileSignatureEditing} maxLength={160} value={profileSignature} onChange={(event) => setProfileSignature(event.target.value)} />
                    </div>
                     <div className="order-7 rounded-2xl border border-line bg-white/80 p-3 shadow-sm">
                       <p className="text-sm font-semibold text-ink">{uiLabel(uiLanguage, { zh: "聊天设置", en: "Chat settings", hi: "चैट सेटिंग" })}</p>
                      <label className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-line bg-white px-3 py-2 text-sm text-ink">
                        <span>{t.showSenderNames}</span>
                        <input checked={showSenderNames} onChange={(event) => setShowSenderNames(event.target.checked)} type="checkbox" />
                      </label>
                       <div className="mt-3 rounded-2xl border border-line bg-white p-3">
                        <p className="text-sm font-medium text-ink">{uiLabel(uiLanguage, { zh: "聊天信息功能键", en: "Message action buttons", hi: "संदेश क्रिया बटन" })}</p>
                        <p className="mt-1 text-xs text-slate-500">{uiLabel(uiLanguage, { zh: "选择功能键直接显示在消息下方，或长按消息后再弹出菜单。", en: "Show actions below each message, or open them by pressing and holding a message.", hi: "क्रियाएं संदेश के नीचे दिखाएं या संदेश को दबाकर मेनू खोलें।" })}</p>
                        <div className="mt-3 space-y-2">
                          <button className={`flex w-full items-start gap-3 rounded-2xl border px-3 py-2 text-left text-sm ${messageActionDisplayMode === "inline" ? "border-brand bg-brand/10 text-brand" : "border-line text-ink hover:border-brand"}`} onClick={() => setMessageActionDisplayMode("inline")} type="button">
                            <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border ${messageActionDisplayMode === "inline" ? "border-brand bg-brand text-white" : "border-line text-transparent"}`}><Check size={14} /></span>
                            <span><span className="block font-medium">{uiLabel(uiLanguage, { zh: "消息下方直接显示", en: "Show below messages", hi: "संदेश के नीचे दिखाएं" })}</span><span className="mt-1 block text-xs opacity-70">{uiLabel(uiLanguage, { zh: "完整显示重新翻译、双朗读、收藏、撤回、转发、引用、提醒和复制", en: "Show the full translate, read, favorite, recall, forward, quote, remind and copy toolbar", hi: "अनुवाद, पढ़ने, पसंदीदा, वापस लेने, फ़ॉरवर्ड, उद्धरण, रिमाइंडर और कॉपी की पूरी पट्टी" })}</span></span>
                          </button>
                          <button className={`flex w-full items-start gap-3 rounded-2xl border px-3 py-2 text-left text-sm ${messageActionDisplayMode === "compact" ? "border-brand bg-brand/10 text-brand" : "border-line text-ink hover:border-brand"}`} onClick={() => setMessageActionDisplayMode("compact")} type="button">
                            <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border ${messageActionDisplayMode === "compact" ? "border-brand bg-brand text-white" : "border-line text-transparent"}`}><Check size={14} /></span>
                            <span><span className="block font-medium">{uiLabel(uiLanguage, { zh: "只显示五个按钮：重新翻译、原文朗读、译文朗读、复制原文、复制译文", en: "Only five buttons: retranslate, read original/translation, copy original/translation", hi: "केवल पाँच बटन: पुनः अनुवाद, मूल/अनुवाद पढ़ें, मूल/अनुवाद कॉपी करें" })}</span><span className="mt-1 block text-xs opacity-70">{uiLabel(uiLanguage, { zh: "五个按钮始终紧跟消息显示；暂不可用的按钮会置灰，长按仍可打开完整菜单", en: "All five stay after the message; unavailable actions are disabled, and press-and-hold opens the full menu", hi: "पाँचों बटन संदेश के बाद बने रहते हैं; अनुपलब्ध बटन निष्क्रिय रहते हैं और दबाकर पूरा मेनू खुलता है" })}</span></span>
                          </button>
                          <button className={`flex w-full items-start gap-3 rounded-2xl border px-3 py-2 text-left text-sm ${messageActionDisplayMode === "long-press" ? "border-brand bg-brand/10 text-brand" : "border-line text-ink hover:border-brand"}`} onClick={() => setMessageActionDisplayMode("long-press")} type="button">
                            <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border ${messageActionDisplayMode === "long-press" ? "border-brand bg-brand text-white" : "border-line text-transparent"}`}><Check size={14} /></span>
                            <span><span className="block font-medium">{uiLabel(uiLanguage, { zh: "长按弹出菜单", en: "Press and hold menu", hi: "दबाकर मेनू खोलें" })}</span><span className="mt-1 block text-xs opacity-70">{uiLabel(uiLanguage, { zh: "聊天窗口更简洁", en: "Cleaner conversation view", hi: "अधिक साफ चैट दृश्य" })}</span></span>
                          </button>
                         </div>
                       </div>
                       <div className="mt-3 rounded-2xl border border-line bg-white p-3">
                         <p className="text-sm font-medium text-ink">{uiLabel(uiLanguage, { zh: "聊天信息时间", en: "Message time", hi: "संदेश समय" })}</p>
                         <p className="mt-1 text-xs text-slate-500">{uiLabel(uiLanguage, { zh: "时间统一使用节省空间的 24 小时制。", en: "Times use a compact 24-hour clock.", hi: "समय संक्षिप्त 24-घंटे प्रारूप में दिखता है।" })}</p>
                         <div className="mt-3 space-y-2">
                           {([
                             ["bottom", uiLabel(uiLanguage, { zh: "信息底部", en: "Below message", hi: "संदेश के नीचे" })],
                             ["tail", uiLabel(uiLanguage, { zh: "信息尾部", en: "Message tail", hi: "संदेश के अंत में" })],
                             ["hidden", uiLabel(uiLanguage, { zh: "不显示", en: "Hidden", hi: "न दिखाएं" })]
                           ] as Array<[MessageTimeDisplayMode, string]>).map(([mode, label]) => (
                             <button key={mode} className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left text-sm font-medium ${messageTimeDisplayMode === mode ? "border-brand bg-brand/10 text-brand" : "border-line text-ink hover:border-brand"}`} onClick={() => setMessageTimeDisplayMode(mode)} type="button"><span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${messageTimeDisplayMode === mode ? "border-brand bg-brand text-white" : "border-line text-transparent"}`}><Check size={14} /></span><span>{label}</span></button>
                           ))}
                         </div>
                       </div>
                       <div className="mt-3 rounded-2xl border border-line bg-white p-3">
                         <p className="text-sm font-medium text-ink">{uiLabel(uiLanguage, { zh: "已读状态标记", en: "Read status indicator", hi: "पढ़े जाने की स्थिति का चिह्न" })}</p>
                         <p className="mt-1 text-xs text-slate-500">{uiLabel(uiLanguage, { zh: "独立控制是否在自己发送的消息时间后显示发送、送达和已读标记。", en: "Independently show or hide sent, delivered, and read indicators after the message time.", hi: "संदेश समय के बाद भेजे, पहुंचाए और पढ़े जाने के चिह्न अलग से दिखाएं या छिपाएं।" })}</p>
                         <div className="mt-3 space-y-2">
                           {([true, false] as const).map((visible) => (
                             <button key={String(visible)} className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left text-sm font-medium ${showMessageReadStatus === visible ? "border-brand bg-brand/10 text-brand" : "border-line text-ink hover:border-brand"}`} onClick={() => setShowMessageReadStatus(visible)} type="button"><span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${showMessageReadStatus === visible ? "border-brand bg-brand text-white" : "border-line text-transparent"}`}><Check size={14} /></span><span>{visible ? uiLabel(uiLanguage, { zh: "显示状态标记", en: "Show status indicators", hi: "स्थिति चिह्न दिखाएं" }) : uiLabel(uiLanguage, { zh: "不显示状态标记", en: "Hide status indicators", hi: "स्थिति चिह्न छिपाएं" })}</span></button>
                           ))}
                         </div>
                       </div>
                     </div>
                     <div className="order-8 rounded-2xl border border-line bg-white/80 p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                           <p className="text-sm font-semibold text-ink">{uiLabel(uiLanguage, { zh: "快捷键设置", en: "Shortcut settings", hi: "शॉर्टकट सेटिंग" })}</p>
                          <p className="mt-1 text-xs text-slate-500">{uiLabel(uiLanguage, { zh: "发送、截图等电脑快捷键统一在这里设置。", en: "Configure desktop shortcuts for sending and screenshots here.", hi: "भेजने और स्क्रीनशॉट के शॉर्टकट यहां सेट करें।" })}</p>
                        </div>
                      </div>
                      <div className="mt-3 space-y-2">
                        <p className="text-xs font-medium text-slate-500">{uiLabel(uiLanguage, { zh: "输入框信息发送", en: "Message input sending", hi: "संदेश इनपुट भेजना" })}</p>
                        {isMobileComposerDevice ? (
                          <div className="rounded-2xl border border-brand/30 bg-brand/5 px-3 py-2 text-sm text-brand">{t.mobileSendByButton}</div>
                        ) : (
                          <>
                            <button className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left text-sm ${!sendWithEnter ? "border-brand bg-brand/10 text-brand" : "border-line bg-white text-ink hover:border-brand"}`} onClick={() => setSendWithEnter(false)} type="button">
                              <span className={`grid h-6 w-6 place-items-center rounded-full border ${!sendWithEnter ? "border-brand bg-brand text-white" : "border-line text-transparent"}`}><Check size={14} /></span>
                              <span><strong>Ctrl+Enter</strong> {uiLabel(uiLanguage, { zh: "发送，Enter 换行", en: "sends, Enter inserts a new line", hi: "भेजे，Enter नई पंक्ति" })}</span>
                            </button>
                            <button className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left text-sm ${sendWithEnter ? "border-brand bg-brand/10 text-brand" : "border-line bg-white text-ink hover:border-brand"}`} onClick={() => setSendWithEnter(true)} type="button">
                              <span className={`grid h-6 w-6 place-items-center rounded-full border ${sendWithEnter ? "border-brand bg-brand text-white" : "border-line text-transparent"}`}><Check size={14} /></span>
                              <span><strong>Enter</strong> {uiLabel(uiLanguage, { zh: "发送，Ctrl+Enter 换行", en: "sends, Ctrl+Enter inserts a new line", hi: "भेजे，Ctrl+Enter नई पंक्ति" })}</span>
                            </button>
                          </>
                        )}
                      </div>
                      <label className="mt-3 block text-xs font-medium text-slate-500">{uiLabel(uiLanguage, { zh: "截图快捷键", en: "Screenshot shortcut", hi: "स्क्रीनशॉट शॉर्टकट" })}<input className="mt-1 h-10 w-full rounded-2xl border border-line bg-white px-3 text-sm outline-none focus:border-brand" maxLength={40} value={screenshotShortcut} onChange={(event) => setScreenshotShortcut(event.target.value)} placeholder="ALT+Q" /></label>
                    </div>
                     <section className="order-3 rounded-2xl border border-line bg-white/80 p-3 shadow-sm">
                       <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-ink">{t.registeredInfo}</p>
                       <div className="flex shrink-0 gap-2">
                          <button className="inline-flex h-10 items-center justify-center rounded-2xl border border-line bg-white px-3 text-sm font-medium text-ink hover:border-brand" onClick={() => { setProfileNotice(""); setProfileEditing(true); }} type="button">{t.editProfile}</button>
                          <button className="inline-flex h-10 items-center justify-center rounded-2xl bg-brand px-3 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60" disabled={profileSaving || profileNicknameValue.trim().length < 2 || !profileEditing} type="submit">{profileSaving ? "..." : t.saveProfile}</button>
                       </div>
                       </div>
                    {profileNotice ? <div className="glimpse-notice-fade rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" role="status">{localizeNoticeMessage(profileNotice, uiLanguage)}</div> : null}
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="block text-xs font-medium text-slate-500">{t.profileEmail}<input className="mt-1 h-10 w-full rounded-2xl border border-line bg-white/80 px-3 text-sm text-slate-500" disabled value={currentUser?.email ?? ""} readOnly /></label>
                      <label className="block text-xs font-medium text-slate-500">{t.profilePhone}<input className="mt-1 h-10 w-full rounded border border-line px-3 text-sm outline-none focus:border-brand disabled:bg-paper disabled:text-slate-500" disabled={!profileEditing} maxLength={40} value={profilePhoneValue} onChange={(event) => setProfilePhoneValue(event.target.value)} /></label>
                      <label className="block text-xs font-medium text-slate-500 sm:col-span-2">{t.profilePublicId}<input className="mt-1 h-10 w-full rounded border border-line px-3 text-sm outline-none focus:border-brand disabled:bg-paper disabled:text-slate-500" disabled={!profileEditing} maxLength={32} value={profilePublicId} onChange={(event) => { setProfileNotice(""); setProfilePublicId(event.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, "")); }} /><span className="mt-1 block text-[11px] font-normal text-slate-400">{t.profileIdHint}</span></label>
                      <label className="flex items-center gap-2 text-sm font-medium text-ink sm:col-span-2"><input checked={profileIsPublic} disabled={profileSaving} onChange={(event) => void handleToggleProfilePublic(event.target.checked)} type="checkbox" />{t.profilePublic}</label>
                      <label className="flex items-center gap-2 text-sm font-medium text-ink"><input checked={profileEmailPublic} disabled={profileSaving || !profileIsPublic || !currentUser?.email} onChange={(event) => void handleToggleProfileEmailPublic(event.target.checked)} type="checkbox" />{t.profileEmailPublic}</label>
                      <label className="flex items-center gap-2 text-sm font-medium text-ink"><input checked={profilePhonePublic} disabled={profileSaving || !profileIsPublic || !profilePhoneValue.trim()} onChange={(event) => void handleToggleProfilePhonePublic(event.target.checked)} type="checkbox" />{t.profilePhonePublic}</label>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="block text-xs font-medium text-slate-500">{t.profileNickname}<input className="mt-1 h-10 w-full rounded border border-line px-3 text-sm outline-none focus:border-brand disabled:bg-paper disabled:text-slate-500" disabled={!profileEditing} maxLength={60} value={profileNicknameValue} onChange={(event) => setProfileNicknameValue(event.target.value)} /></label>
                      <label className="block text-xs font-medium text-slate-500">{t.profileCompany}<input className="mt-1 h-10 w-full rounded border border-line px-3 text-sm outline-none focus:border-brand disabled:bg-paper disabled:text-slate-500" disabled={!profileEditing} maxLength={120} value={profileCompany} onChange={(event) => setProfileCompany(event.target.value)} /></label>
                      <label className="block text-xs font-medium text-slate-500">{t.profileTitle}<input className="mt-1 h-10 w-full rounded border border-line px-3 text-sm outline-none focus:border-brand disabled:bg-paper disabled:text-slate-500" disabled={!profileEditing} maxLength={120} value={profileTitle} onChange={(event) => setProfileTitle(event.target.value)} /></label>
                      <label className="block text-xs font-medium text-slate-500">{t.profileLocation}<input className="mt-1 h-10 w-full rounded border border-line px-3 text-sm outline-none focus:border-brand disabled:bg-paper disabled:text-slate-500" disabled={!profileEditing} maxLength={120} value={profileLocation} onChange={(event) => setProfileLocation(event.target.value)} /></label>
                    </div>
                    <label className="mt-3 block text-xs font-medium text-slate-500">{t.profileBio}<textarea className="mt-1 min-h-20 w-full resize-y rounded-2xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand disabled:bg-paper disabled:text-slate-500" disabled={!profileEditing} maxLength={500} value={profileBio} onChange={(event) => setProfileBio(event.target.value)} /></label>
                  </section>
                  </div>
                </form>
                {currentUser?.role === "admin" ? (
                  <div className="rounded-2xl border border-line bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-ink">{t.adminDashboard}</p>
                      <button className="rounded border border-line px-3 py-2 text-xs font-medium text-ink hover:border-brand disabled:opacity-60" disabled={adminLoading} onClick={() => void loadAdminDashboard()} type="button">
                        {adminLoading ? "..." : t.adminLoad}
                      </button>
                    </div>
                  </div>
                ) : null}
                {currentUser?.role === "admin" && adminModalOpen && typeof document !== "undefined" ? createPortal(
                  <div className="fixed inset-0 z-[2147483647] isolate h-[100dvh] w-[100dvw] overflow-hidden bg-slate-950/45 p-0" role="dialog" aria-modal="true" aria-label={t.adminDashboard}>
                    <div className="flex h-screen w-screen flex-col overflow-hidden border border-white/80 bg-white/95 shadow-2xl backdrop-blur-xl">
                      <div className="flex items-center justify-between border-b border-line px-4 py-3">
                        <p className="text-base font-semibold text-ink">{t.adminDashboard}</p>
                        <div className="flex items-center gap-2">
                          <button className="rounded border border-line px-3 py-2 text-xs font-medium text-ink hover:border-brand disabled:opacity-60" disabled={adminLoading} onClick={() => void loadAdminDashboard()} type="button">
                            {adminLoading ? "..." : t.adminLoad}
                          </button>
                          <button className="rounded border border-line px-3 py-2 text-xs font-medium text-ink hover:border-brand" onClick={() => setAdminModalOpen(false)} type="button">
                            {t.adminClose}
                          </button>
                        </div>
                      </div>
                      <div className="flex-1 overflow-auto bg-[linear-gradient(180deg,rgba(238,247,248,0.72),rgba(255,255,255,0.88))] p-4">
                        <nav className="sticky top-0 z-20 -mx-4 -mt-4 mb-4 flex gap-2 overflow-x-auto border-b border-line bg-white/95 px-4 py-3 backdrop-blur" aria-label={uiLabel(uiLanguage, { zh: "后台分组", en: "Admin sections", hi: "एडमिन अनुभाग" })}>
                          {([
                            ["overview", uiLabel(uiLanguage, { zh: "概览", en: "Overview", hi: "अवलोकन" })],
                            ["settings", uiLabel(uiLanguage, { zh: "系统配置", en: "Settings", hi: "सेटिंग्स" })],
                            ["slogans", uiLabel(uiLanguage, { zh: "标题栏动态标语", en: "Title slogans", hi: "शीर्षक नारे" })],
                            ["users", uiLabel(uiLanguage, { zh: "用户与反馈", en: "Users & feedback", hi: "उपयोगकर्ता और फीडबैक" })],
                            ["conversations", uiLabel(uiLanguage, { zh: "会话", en: "Conversations", hi: "बातचीत" })]
                          ] as Array<[AdminDashboardTab, string]>).map(([tab, label]) => <button key={tab} className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold ${adminDashboardTab === tab ? "border-brand bg-brand text-white" : "border-line bg-white text-ink hover:border-brand"}`} onClick={() => setAdminDashboardTab(tab)} type="button">{label}</button>)}
                        </nav>
                        {adminOverview ? (
                          <div className={`${adminDashboardTab === "overview" ? "grid" : "hidden"} gap-3 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8`}>
                            <div className="rounded-2xl border border-line bg-white p-3"><span className="block text-slate-400">{t.adminUsers}</span><strong className="text-lg text-ink">{adminOverview.users}</strong></div>
                            <div className="rounded-2xl border border-line bg-white p-3" title={uiLabel(uiLanguage, { zh: "由实时在线事件更新", en: "Updated by live presence events", hi: "लाइव उपस्थिति से अपडेट" })}><span className="block text-slate-400">{uiLabel(uiLanguage, { zh: "在线人数（实时）", en: "Online users (live)", hi: "ऑनलाइन उपयोगकर्ता (लाइव)" })}</span><strong className="text-lg text-emerald-600" data-admin-online-users-live="true">{onlineUserIds.size}</strong><span className="block text-[10px] text-emerald-600">{connectionState === "connected" ? uiLabel(uiLanguage, { zh: "实时连接中", en: "Live", hi: "लाइव" }) : uiLabel(uiLanguage, { zh: "正在重连", en: "Reconnecting", hi: "फिर जुड़ रहा है" })}</span></div>
                            <div className="rounded-2xl border border-line bg-white p-3"><span className="block text-slate-400">{t.adminDisabledUsers}</span><strong className="text-lg text-ink">{adminOverview.disabledUsers}</strong></div>
                            <div className="rounded-2xl border border-line bg-white p-3"><span className="block text-slate-400">{t.adminConversations}</span><strong className="text-lg text-ink">{adminOverview.conversations}</strong></div>
                            <div className="rounded-2xl border border-line bg-white p-3"><span className="block text-slate-400">{t.adminMessages}</span><strong className="text-lg text-ink">{adminOverview.messages}</strong></div>
                            <div className="rounded-2xl border border-line bg-white p-3"><span className="block text-slate-400">{t.adminOpenFeedback}</span><strong className="text-lg text-ink">{adminOverview.openFeedback}</strong></div>
                            <div className="rounded-2xl border border-line bg-white p-3" title={`${adminOverview.storage.projectRoot} · ${new Date(adminOverview.storage.measuredAt).toLocaleString()}`}><span className="block text-slate-400">{uiLabel(uiLanguage, { zh: "系统可用空间", en: "System free space", hi: "सिस्टम खाली स्थान" })}</span><strong className="text-lg text-ink">{formatFileSize(adminOverview.storage.freeBytes)}</strong><span className="block text-[10px] text-slate-400">/ {formatFileSize(adminOverview.storage.totalBytes)}</span></div>
                            <div className="rounded-2xl border border-line bg-white p-3" title={adminOverview.storage.projectRoot}><span className="block text-slate-400">{uiLabel(uiLanguage, { zh: "程序资料占用", en: "Program data used", hi: "प्रोग्राम डेटा उपयोग" })}</span><strong className="text-lg text-ink">{formatFileSize(adminOverview.storage.projectBytes)}</strong><span className="block truncate text-[10px] text-slate-400">{adminOverview.storage.projectRoot}</span></div>
                          </div>
                        ) : null}
                        {adminDashboardTab === "overview" && adminToolHealthLoading && !adminToolHealth ? (
                          <div className="mt-4 rounded-2xl border border-line bg-white px-3 py-3 text-xs text-slate-500">
                            <span className="mr-2 inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-amber-400" />
                            {uiLabel(uiLanguage, { zh: "正在逐项检测各调用工具，请稍候……", en: "Checking integrations one by one…", hi: "इंटीग्रेशन की एक-एक करके जांच हो रही है…" })}
                          </div>
                        ) : null}
                        {adminDashboardTab === "overview" && adminToolHealthError && !adminToolHealthLoading ? (
                          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-3 py-3 text-xs text-red-700" role="alert" data-admin-tool-health-error="true">
                            <p className="font-semibold">{uiLabel(uiLanguage, { zh: "调用工具健康检测未完成", en: "Integration health check did not complete", hi: "इंटीग्रेशन स्वास्थ्य जांच पूरी नहीं हुई" })}</p>
                            <p className="mt-1 break-words">{adminToolHealthError}</p>
                            <button className="mt-2 rounded border border-red-300 bg-white px-2.5 py-1.5 font-medium text-red-700 hover:border-red-500" onClick={() => void loadAdminToolHealth()} type="button">
                              {uiLabel(uiLanguage, { zh: "重新检测", en: "Check again", hi: "फिर जांचें" })}
                            </button>
                          </div>
                        ) : null}
                        {adminToolHealth ? (
                          <section className={`${adminDashboardTab === "overview" ? "mt-4" : "hidden"} rounded-2xl border border-line bg-white p-3`}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="text-sm font-semibold text-ink">{uiLabel(uiLanguage, { zh: "调用工具健康状态", en: "Integration health", hi: "इंटीग्रेशन स्वास्थ्य" })}</p>
                                <p className="mt-0.5 text-[11px] text-slate-500">
                                  {uiLabel(uiLanguage, { zh: "进入后台时自动检测；红色项目会显示具体错误。", en: "Checked automatically when the admin page opens; red items show the exact error.", hi: "एडमिन पेज खुलने पर स्वतः जांच; लाल आइटम में त्रुटि दिखाई जाती है।" })}
                                  {" · "}{new Date(adminToolHealth.checkedAt).toLocaleString()}
                                </p>
                              </div>
                              <button className="rounded border border-line px-2.5 py-1.5 text-xs font-medium text-ink hover:border-brand disabled:opacity-60" disabled={adminToolHealthLoading} onClick={() => void loadAdminToolHealth()} type="button">
                                {adminToolHealthLoading ? "..." : uiLabel(uiLanguage, { zh: "重新检测", en: "Check again", hi: "फिर जांचें" })}
                              </button>
                            </div>
                            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                              {adminToolHealth.tools.map((item) => (
                                <div key={item.id} className={"rounded-xl border p-2.5 " + (item.status === "healthy" ? "border-emerald-200 bg-emerald-50/60" : "border-red-200 bg-red-50/70")}>
                                  <div className="flex items-start gap-2">
                                    <span className={"mt-1 h-2.5 w-2.5 shrink-0 rounded-full " + (item.status === "healthy" ? "bg-emerald-500" : "bg-red-500")} aria-label={item.status} />
                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="font-medium text-ink">{item.label}</span>
                                        {item.active ? <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand">{uiLabel(uiLanguage, { zh: "当前使用", en: "Active", hi: "सक्रिय" })}</span> : null}
                                        <span className="rounded bg-white/80 px-1.5 py-0.5 text-[10px] text-slate-500">{item.mode === "real" ? uiLabel(uiLanguage, { zh: "真实调用", en: "Live call", hi: "लाइव कॉल" }) : item.mode === "client" ? uiLabel(uiLanguage, { zh: "本机检测", en: "Client check", hi: "क्लाइंट जांच" }) : uiLabel(uiLanguage, { zh: "配置检查", en: "Config check", hi: "कॉन्फ़िग जांच" })}</span>
                                      </div>
                                      <p className={"mt-1 break-words text-[11px] " + (item.status === "healthy" ? "text-emerald-800" : "text-red-700")}>{item.message}</p>
                                      <div className="mt-1 flex items-center justify-between gap-2">
                                        <p className="min-w-0 truncate text-[10px] text-slate-400">{item.provider ?? item.category}{item.elapsedMs > 0 ? " · " + item.elapsedMs + " ms" : ""}</p>
                                        <button className="shrink-0 rounded border border-line bg-white px-2 py-1 text-[10px] font-medium text-ink hover:border-brand disabled:opacity-50" disabled={adminToolHealthLoading || adminToolRetestingIds.has(item.id)} onClick={() => void retestAdminToolHealth(item.id)} type="button">{adminToolRetestingIds.has(item.id) ? "..." : uiLabel(uiLanguage, { zh: "单独重测", en: "Retest", hi: "फिर जांचें" })}</button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </section>
                        ) : null}
                        {adminDashboardTab === "users" && adminPasswordReset ? (
                          <div className="mt-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                            <p className="font-medium">{adminPasswordReset.user.nickname} · {t.adminTempPassword}</p>
                            <p className="mt-1 font-mono">{adminPasswordReset.temporaryPassword}</p>
                          </div>
                        ) : null}
                        <div className={`${adminDashboardTab === "settings" ? "grid gap-4 lg:grid-cols-2" : adminDashboardTab === "slogans" ? "block" : "hidden"} mt-4`}>
                          <div className="rounded-2xl border border-line bg-white">
                            <div className={`${adminDashboardTab === "settings" ? "flex" : "hidden"} items-center justify-between gap-2 border-b border-line px-3 py-2`}>
                              <p className="text-xs font-medium text-ink">{uiLabel(uiLanguage, { zh: "系统配置", en: "System settings", hi: "सिस्टम सेटिंग्स" })}</p>
                              <div className="flex flex-wrap justify-end gap-1.5">
                                <button className="rounded border border-line px-2 py-1 text-xs font-medium text-ink hover:border-brand disabled:opacity-60" disabled={adminSettingsSaving || adminSmtpTestSaving} onClick={() => void saveAdminSettings()} type="button">{adminSettingsSaving ? "..." : uiLabel(uiLanguage, { zh: "保存", en: "Save", hi: "सहेजें" })}</button>
                                <button className="rounded border border-brand/40 bg-brand/5 px-2 py-1 text-xs font-medium text-brand hover:border-brand disabled:opacity-60" disabled={adminSettingsSaving || adminSmtpTestSaving} onClick={() => void testAdminSmtp()} type="button">{adminSmtpTestSaving ? "..." : uiLabel(uiLanguage, { zh: "发送测试邮件", en: "Send test email", hi: "टेस्ट ईमेल भेजें" })}</button>
                              </div>
                            </div>
                            {adminDashboardTab === "settings" ? <p className="mx-3 mt-2 text-[11px] text-slate-500">{uiLabel(uiLanguage, { zh: "测试邮件只发送到当前管理员注册邮箱；保存 SMTP 配置后可直接发送，无需重启 API。", en: "The test email goes only to the current administrator registration email; save SMTP settings and send it directly without restarting the API.", hi: "टेस्ट ईमेल केवल वर्तमान एडमिन के पंजीकृत ईमेल पर जाएगा; SMTP सेव करके API रीस्टार्ट किए बिना सीधे भेजें।" })}</p> : null}
                            {adminSettingsNotice ? <div className="mx-3 mt-3 rounded border border-brand/20 bg-brand/10 px-3 py-2 text-xs text-brand">{adminSettingsNotice}</div> : null}
                            {adminDashboardTab === "slogans" && adminSettings.some((item) => item.key === "APP_SLOGANS_JSON") ? (
                              <section className="mx-3 mt-3 rounded-2xl border border-brand/20 bg-brand/[0.03] p-3">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div>
                                    <p className="text-xs font-semibold text-ink">{uiLabel(uiLanguage, { zh: "标题栏动态标语", en: "Dynamic title slogans", hi: "डायनामिक शीर्षक नारे" })}</p>
                                    <p className="mt-1 text-[11px] text-slate-500">{uiLabel(uiLanguage, { zh: "逐条修改三种语言，取消勾选即可停用；支持增加或删除标语。", en: "Edit all three languages per line, uncheck to disable, and add or remove slogans.", hi: "हर पंक्ति की तीनों भाषाएं बदलें, अनचेक करके बंद करें और नारे जोड़ें या हटाएं।" })}</p>
                                  </div>
                                  <div className="flex flex-wrap gap-1.5">
                                    <button className="rounded border border-line bg-white px-2 py-1 text-[11px] font-medium text-ink hover:border-brand" onClick={resetAdminSlogans} type="button">{uiLabel(uiLanguage, { zh: "恢复默认20条", en: "Restore 20 defaults", hi: "20 डिफॉल्ट बहाल करें" })}</button>
                                    <button className="rounded border border-brand bg-brand px-2 py-1 text-[11px] font-medium text-white hover:bg-brand/90" onClick={addAdminSlogan} type="button">{uiLabel(uiLanguage, { zh: "增加标语", en: "Add slogan", hi: "नारा जोड़ें" })}</button>
                                    <button className="rounded border border-emerald-600 bg-emerald-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50" disabled={adminSloganPublishing || adminSloganGenerating} onClick={() => void publishAdminSlogans()} type="button">{adminSloganPublishing ? uiLabel(uiLanguage, { zh: "发布中……", en: "Publishing…", hi: "प्रकाशित हो रहा है…" }) : uiLabel(uiLanguage, { zh: "发布", en: "Publish", hi: "प्रकाशित करें" })}</button>
                                  </div>
                                </div>
                                <div className="mt-3 rounded-xl border border-line bg-white p-2">
                                  <label className="block text-[11px] font-medium text-slate-600">
                                    {uiLabel(uiLanguage, { zh: "标语生成提示词", en: "Slogan generation prompt", hi: "नारा बनाने का प्रॉम्प्ट" })}
                                    <textarea
                                      className="mt-1 min-h-16 w-full resize-y rounded-lg border border-line px-2 py-1.5 text-xs text-ink outline-none focus:border-brand"
                                      maxLength={1000}
                                      placeholder={uiLabel(uiLanguage, { zh: "例如：强调跨语言沟通、可靠协作和真实业务场景，语气简洁温暖。", en: "Example: emphasize cross-language communication, reliable teamwork, and real business use in a concise, warm tone.", hi: "उदाहरण: संक्षिप्त और गर्म शैली में बहुभाषी संवाद, भरोसेमंद सहयोग और वास्तविक व्यापार पर जोर दें।" })}
                                      value={adminSloganPrompt}
                                      onChange={(event) => setAdminSloganPrompt(event.target.value)}
                                    />
                                  </label>
                                  <div className="mt-2 flex items-center justify-between gap-2">
                                    <span className="text-[10px] text-slate-400">{adminSloganPrompt.length}/1000</span>
                                    <button className="rounded border border-brand bg-brand px-3 py-1.5 text-[11px] font-medium text-white hover:bg-brand/90 disabled:opacity-50" disabled={adminSloganGenerating || !adminSloganPrompt.trim()} onClick={() => void regenerateAdminSlogans()} type="button">
                                      {adminSloganGenerating ? uiLabel(uiLanguage, { zh: "生成中……", en: "Generating…", hi: "बन रहा है…" }) : uiLabel(uiLanguage, { zh: "重新生成", en: "Regenerate", hi: "दोबारा बनाएं" })}
                                    </button>
                                  </div>
                                </div>
                                <div className="mt-3 max-h-[38vh] space-y-2 overflow-auto pr-1">
                                  {adminSloganDrafts.map((slogan, index) => (
                                    <div key={`${slogan.id}-${index}`} className="rounded-xl border border-line bg-white p-2">
                                      <div className="flex items-center justify-between gap-2 text-[11px]">
                                        <span className="font-semibold text-slate-500">#{index + 1} · {slogan.id}</span>
                                        <div className="flex items-center gap-2">
                                          <label className="flex items-center gap-1 text-slate-600"><input checked={slogan.enabled} onChange={() => toggleAdminSlogan(index)} type="checkbox" />{uiLabel(uiLanguage, { zh: "启用", en: "Enabled", hi: "सक्रिय" })}</label>
                                          <button className="rounded border border-red-200 px-2 py-0.5 text-red-600 hover:bg-red-50 disabled:opacity-50" disabled={adminSloganDrafts.length <= 1} onClick={() => removeAdminSlogan(index)} type="button">{uiLabel(uiLanguage, { zh: "删除", en: "Remove", hi: "हटाएं" })}</button>
                                        </div>
                                      </div>
                                      <div className="mt-2 grid gap-2 sm:grid-cols-3">
                                        <label className="text-[11px] text-slate-500">中文<textarea className="mt-1 min-h-14 w-full resize-y rounded-lg border border-line px-2 py-1.5 text-xs text-ink outline-none focus:border-brand" maxLength={200} value={slogan.zh} onChange={(event) => updateAdminSlogan(index, "zh", event.target.value)} /></label>
                                        <label className="text-[11px] text-slate-500">English<textarea className="mt-1 min-h-14 w-full resize-y rounded-lg border border-line px-2 py-1.5 text-xs text-ink outline-none focus:border-brand" maxLength={200} value={slogan.en} onChange={(event) => updateAdminSlogan(index, "en", event.target.value)} /></label>
                                        <label className="text-[11px] text-slate-500">हिन्दी<textarea className="mt-1 min-h-14 w-full resize-y rounded-lg border border-line px-2 py-1.5 text-xs text-ink outline-none focus:border-brand" maxLength={200} value={slogan.hi} onChange={(event) => updateAdminSlogan(index, "hi", event.target.value)} /></label>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </section>
                            ) : null}
                            <div className={`${adminDashboardTab === "settings" ? "block" : "hidden"} border-b border-line p-3`}>
                              <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 text-slate-400" size={14} /><input className="w-full rounded-xl border border-line bg-white py-2 pl-8 pr-3 text-xs text-ink outline-none focus:border-brand" value={adminSettingSearch} onChange={(event) => setAdminSettingSearch(event.target.value)} placeholder={uiLabel(uiLanguage, { zh: "搜索配置名称、说明或键名", en: "Search name, description, or key", hi: "नाम, विवरण या कुंजी खोजें" })} /></div>
                              <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
                                {["all", ...Array.from(new Set(adminSettings.filter((item) => item.key !== "APP_SLOGANS_JSON" && item.key !== "APP_SLOGAN_ENABLED_IDS").map((item) => item.group)))].map((group) => <button key={group} className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-medium ${adminSettingGroupFilter === group ? "border-brand bg-brand text-white" : "border-line bg-white text-slate-600 hover:border-brand"}`} onClick={() => setAdminSettingGroupFilter(group)} type="button">{group === "all" ? uiLabel(uiLanguage, { zh: "全部分类", en: "All categories", hi: "सभी श्रेणियाँ" }) : adminSettingGroupLabel(group, uiLanguage)} <span className={adminSettingGroupFilter === group ? "text-white/75" : "text-slate-400"}>{group === "all" ? adminSettings.filter((item) => item.key !== "APP_SLOGANS_JSON" && item.key !== "APP_SLOGAN_ENABLED_IDS").length : adminSettings.filter((item) => item.group === group && item.key !== "APP_SLOGANS_JSON" && item.key !== "APP_SLOGAN_ENABLED_IDS").length}</span></button>)}
                              </div>
                            </div>
                            <div className={`${adminDashboardTab === "settings" ? "block" : "hidden"} max-h-[34vh] space-y-3 overflow-auto p-3 text-xs`}>
                              {Object.entries(adminSettings.filter((item) => {
                                if (adminSettingGroupFilter !== "all" && item.group !== adminSettingGroupFilter) return false;
                                const query = adminSettingSearch.trim().toLowerCase();
                                return !query || `${item.key} ${item.label} ${item.description} ${adminSettingLabel(item, uiLanguage)} ${adminSettingDescription(item, uiLanguage)}`.toLowerCase().includes(query);
                              }).reduce<Record<string, AdminSettingRow[]>>((groups, item) => {
                                groups[item.group] = [...(groups[item.group] ?? []), item];
                                return groups;
                              }, {})).map(([group, items]) => {
                                const visibleItems = items.filter((item) => item.key !== "APP_SLOGANS_JSON" && item.key !== "APP_SLOGAN_ENABLED_IDS");
                                if (!visibleItems.length) return null;
                                return <div key={group} className="space-y-2">
                                  <p className="font-medium text-ink">{adminSettingGroupLabel(group, uiLanguage)}</p>
                                  {group === "Speech" ? (
                                    <div className="rounded-2xl border border-brand/20 bg-brand/[0.04] p-2.5">
                                      <div className="flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                          <span className="block font-medium text-ink">{uiLabel(uiLanguage, { zh: "当前朗读配置", en: "Current TTS configuration", hi: "वर्तमान TTS कॉन्फ़िगरेशन" })}</span>
                                          <span className="mt-0.5 block truncate text-slate-500">{ttsConfig.provider === "aliyun_bailian" ? `Aliyun Bailian · ${ttsConfig.aliyun.model} · ${selectedTtsVoiceType || ttsConfig.aliyun.voiceType}` : ttsConfig.provider === "doubao" ? `Doubao TTS · ${selectedTtsVoiceType || ttsConfig.doubao.voiceType || uiLabel(uiLanguage, { zh: "未设置音色", en: "No voice", hi: "वॉइस सेट नहीं" })}` : uiLabel(uiLanguage, { zh: "浏览器内置朗读", en: "Browser built-in TTS", hi: "ब्राउज़र अंतर्निहित TTS" })}</span>
                                          {ttsConfigNotice ? <span className="mt-1 block text-brand">{ttsConfigNotice}</span> : null}
                                        </div>
                                        <button className="shrink-0 rounded border border-brand/40 bg-white px-2.5 py-1.5 text-xs font-medium text-brand hover:border-brand disabled:opacity-60" type="button" disabled={ttsConfigLoading} onClick={() => void loadTtsRuntimeConfig(undefined, true)}>{ttsConfigLoading ? "..." : uiLabel(uiLanguage, { zh: "刷新配置", en: "Refresh", hi: "रीफ़्रेश" })}</button>
                                      </div>
                                    </div>
                                  ) : null}
                                  {visibleItems.map((item) => (
                                    <div key={item.key} className="block rounded-2xl border border-line bg-white/80 p-2">
                                      <span className="flex items-center justify-between gap-2 text-slate-600">
                                        <span className="font-medium text-ink">{adminSettingLabel(item, uiLanguage)}</span>
                                        <span className="rounded bg-white px-2 py-0.5 text-[11px] text-slate-500">{adminSettingSourceLabel(item.source, uiLanguage)}</span>
                                      </span>
                                      {item.options?.length ? (
                                        <div className="mt-2 flex flex-wrap gap-2">
                                          {item.options.map((option) => {
                                            const selected = (adminSettingDrafts[item.key] ?? item.value ?? "") === option.value;
                                            return (
                                              <button key={`${item.key}-${option.value}`} className={`rounded border px-2 py-1 text-xs font-medium ${selected ? "border-brand bg-brand text-white" : "border-line bg-white text-ink hover:border-brand"}`} onClick={() => setAdminSettingDrafts((drafts) => ({ ...drafts, [item.key]: option.value }))} title={option.description ?? option.label} type="button">
                                                {option.label}{selected ? ` · ${uiLabel(uiLanguage, { zh: "当前", en: "Active", hi: "वर्तमान" })}` : ""}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      ) : (
                                        <input className="mt-2 w-full rounded-2xl border border-line bg-white px-2 py-1 outline-none focus:border-brand" type={item.sensitive ? "password" : "text"} placeholder={item.sensitive && item.hasValue ? item.maskedValue || "******" : adminSettingLabel(item, uiLanguage)} value={adminSettingDrafts[item.key] ?? ""} onChange={(event) => setAdminSettingDrafts((drafts) => ({ ...drafts, [item.key]: event.target.value }))} />
                                      )}
                                      <span className="mt-1 block text-slate-400">{adminSettingDescription(item, uiLanguage)}{item.activeOptionLabel ? ` · ${uiLabel(uiLanguage, { zh: "正在调用", en: "Using", hi: "उपयोग में" })}: ${item.activeOptionLabel}` : ""}{item.restartRequired ? ` · ${uiLabel(uiLanguage, { zh: "保存后需重启/重新构建", en: "restart/rebuild required", hi: "रीस्टार्ट/रीबिल्ड आवश्यक" })}` : ""}{item.bootstrapOnly ? ` · ${uiLabel(uiLanguage, { zh: "启动项", en: "bootstrap", hi: "स्टार्टअप" })}` : ""}</span>
                                    </div>
                                  ))}
                                </div>;
                              })}
                            </div>
                          </div>
                          <div className={`${adminDashboardTab === "settings" ? "block" : "hidden"} rounded-2xl border border-line bg-white`}>
                            <div className="border-b border-line px-3 py-2">
                              <p className="text-xs font-medium text-ink">{uiLabel(uiLanguage, { zh: "管理员账户", en: "Administrators", hi: "एडमिन खाते" })}</p>
                              <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                                <input className="rounded border border-line px-2 py-1 outline-none focus:border-brand" placeholder={uiLabel(uiLanguage, { zh: "邮箱", en: "Email", hi: "ईमेल" })} value={adminAccountForm.email} onChange={(event) => setAdminAccountForm((form) => ({ ...form, email: event.target.value }))} />
                                <input className="rounded border border-line px-2 py-1 outline-none focus:border-brand" placeholder={uiLabel(uiLanguage, { zh: "电话", en: "Phone", hi: "फोन" })} value={adminAccountForm.phone} onChange={(event) => setAdminAccountForm((form) => ({ ...form, phone: event.target.value }))} />
                                <input className="rounded border border-line px-2 py-1 outline-none focus:border-brand" placeholder={uiLabel(uiLanguage, { zh: "昵称", en: "Nickname", hi: "उपनाम" })} value={adminAccountForm.nickname} onChange={(event) => setAdminAccountForm((form) => ({ ...form, nickname: event.target.value }))} />
                                <input className="rounded border border-line px-2 py-1 outline-none focus:border-brand" placeholder={uiLabel(uiLanguage, { zh: "新账号初始密码（已有用户留空）", en: "New-account password (blank for existing user)", hi: "नए खाते का पासवर्ड (मौजूदा उपयोगकर्ता के लिए खाली)" })} type="password" value={adminAccountForm.password} onChange={(event) => setAdminAccountForm((form) => ({ ...form, password: event.target.value }))} />
                              </div>
                              {adminAccountNotice ? <div className="mt-2 rounded border border-brand/20 bg-brand/10 px-2.5 py-2 text-xs text-brand" role="status">{adminAccountNotice}</div> : null}
                              <div className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                                {ADMIN_PERMISSION_OPTIONS.map((option) => (
                                  <label key={option.code} className="flex items-center gap-2 text-slate-600">
                                    <input type="checkbox" checked={adminAccountForm.adminPermissions.includes(option.code)} onChange={() => toggleAdminAccountFormPermission(option.code)} />
                                    <span>{adminPermissionLabel(option, uiLanguage)}</span>
                                  </label>
                                ))}
                              </div>
                              <button className="mt-2 rounded border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-brand disabled:opacity-60" disabled={adminAccountSaving} onClick={() => void createAdminAccount()} type="button">{adminAccountSaving ? "..." : uiLabel(uiLanguage, { zh: "新增或提升管理员", en: "Add or promote administrator", hi: "एडमिन जोड़ें या पदोन्नत करें" })}</button>
                            </div>
                            <div className="max-h-[34vh] overflow-auto text-xs">
                              {adminAccounts.map((admin) => (
                                <div key={admin.id} className="border-b border-line px-3 py-2 last:border-b-0">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="font-medium text-ink">{admin.nickname} <span className="text-slate-400">{admin.email ?? admin.phone ?? admin.id}</span> {admin.isSuperAdmin ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">{uiLabel(uiLanguage, { zh: "超级管理员", en: "Super admin", hi: "सुपर एडमिन" })}</span> : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{uiLabel(uiLanguage, { zh: "普通管理员", en: "Administrator", hi: "एडमिन" })}</span>}</p>
                                    {currentUser?.isSuperAdmin && !admin.isSuperAdmin && admin.id !== currentUser.id ? <button className="rounded border border-red-200 px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-60" disabled={adminActionUserId === admin.id} type="button" onClick={() => void revokeAdminAccess(admin)}>{adminActionUserId === admin.id ? "..." : uiLabel(uiLanguage, { zh: "撤销管理员身份", en: "Revoke admin access", hi: "एडमिन पहुँच रद्द करें" })}</button> : null}
                                  </div>
                                  <div className="mt-2 grid gap-1 sm:grid-cols-2">
                                    {ADMIN_PERMISSION_OPTIONS.map((option) => (
                                      <label key={`${admin.id}-${option.code}`} className="flex items-center gap-2 text-slate-600">
                                        <input type="checkbox" disabled={adminActionUserId === admin.id || Boolean(admin.isSuperAdmin)} checked={admin.isSuperAdmin || (admin.adminPermissions ?? []).length === 0 || (admin.adminPermissions ?? []).includes(option.code)} onChange={(event) => void saveAdminPermissions(admin, option.code, event.target.checked)} />
                                        <span>{adminPermissionLabel(option, uiLanguage)}</span>
                                      </label>
                                    ))}
                                  </div>
                                  {admin.isSuperAdmin ? <p className="mt-1 text-amber-700">{uiLabel(uiLanguage, { zh: "超级管理员始终拥有全部后台权限，不能被其他管理员删除。", en: "Super administrators always have full access and cannot be removed by other administrators.", hi: "सुपर एडमिन के पास हमेशा पूर्ण अधिकार होते हैं और अन्य एडमिन उन्हें हटा नहीं सकते।" })}</p> : (admin.adminPermissions ?? []).length === 0 ? <p className="mt-1 text-slate-400">{uiLabel(uiLanguage, { zh: "空权限列表表示兼容旧管理员：拥有全部权限。", en: "Empty permissions means legacy full access.", hi: "खाली अनुमति सूची पुराने एडमिन के लिए पूर्ण अधिकार दर्शाती है." })}</p> : null}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                        {adminDashboardTab === "users" && adminSelectedUserChats ? (
                          <div className="mt-4 rounded-2xl border border-line bg-white">
                            <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2">
                              <div>
                                <p className="text-xs font-medium text-ink">{t.adminUserChats}</p>
                                <p className="text-xs text-slate-500">{adminSelectedUserChats.user.nickname} · {adminSelectedUserChats.user.email ?? adminSelectedUserChats.user.phone ?? adminSelectedUserChats.user.id}</p>
                              </div>
                              <button className="rounded border border-line px-2 py-1 text-xs font-medium text-ink hover:border-brand" type="button" onClick={() => setAdminSelectedUserChats(null)}>{t.adminClose}</button>
                            </div>
                            <div className="mx-3 mt-3 flex items-center gap-2 rounded-2xl border border-line bg-white px-2 py-1.5 text-xs text-slate-500">
                              <Search size={14} />
                              <input className="min-w-0 flex-1 bg-transparent outline-none" placeholder={uiLabel(uiLanguage, { zh: "搜索聊天内容、联系人、时间或文件", en: "Search messages, contacts, dates, or files", hi: "संदेश, संपर्क, तारीख या फ़ाइल खोजें" })} value={adminUserChatQuery} onChange={(event) => setAdminUserChatQuery(event.target.value)} />
                              {adminUserChatQuery ? <button className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-paper hover:text-ink" onClick={() => setAdminUserChatQuery("")} type="button" aria-label={uiLabel(uiLanguage, { zh: "清空搜索", en: "Clear search", hi: "खोज साफ करें" })}>×</button> : null}
                            </div>
                            <div className="grid gap-3 p-3 text-xs lg:grid-cols-[280px_1fr]">
                              <div className="rounded-2xl border border-line bg-white/80 p-3 text-slate-600">
                                <p className="font-medium text-ink">{t.adminUserDetails}</p>
                                <div className="mt-3 flex items-center gap-3">
                                  <Avatar name={adminSelectedUserChats.user.nickname} url={adminSelectedUserChats.user.avatarUrl} />
                                  <div className="min-w-0">
                                    <p className="truncate font-medium text-ink">{adminSelectedUserChats.user.nickname}</p>
                                    <p className="text-slate-500">{adminSelectedUserChats.user.disabledAt ? t.adminDisabledUsers : uiLabel(uiLanguage, { zh: "正常", en: "Active", hi: "सक्रिय" })}</p>
                                  </div>
                                </div>
                                <dl className="mt-3 space-y-2">
                                  <div><dt className="text-slate-400">ID</dt><dd className="break-all text-ink">{adminSelectedUserChats.user.id}</dd></div>
                                  <div><dt className="text-slate-400">{uiLabel(uiLanguage, { zh: "邮箱", en: "Email", hi: "ईमेल" })}</dt><dd>{adminSelectedUserChats.user.email ?? uiLabel(uiLanguage, { zh: "无邮箱", en: "No email", hi: "ईमेल नहीं" })}</dd></div>
                                  <div><dt className="text-slate-400">{uiLabel(uiLanguage, { zh: "电话", en: "Phone", hi: "फोन" })}</dt><dd>{adminSelectedUserChats.user.phone ?? uiLabel(uiLanguage, { zh: "无电话", en: "No phone", hi: "फोन नहीं" })}</dd></div>
                                  <div><dt className="text-slate-400">{uiLabel(uiLanguage, { zh: "角色 / 语言", en: "Role / Language", hi: "भूमिका / भाषा" })}</dt><dd>{adminSelectedUserChats.user.role} / {adminSelectedUserChats.user.language}</dd></div>
                                  <div><dt className="text-slate-400">{uiLabel(uiLanguage, { zh: "创建时间", en: "Created", hi: "बनाया गया" })}</dt><dd>{adminSelectedUserChats.user.createdAt}</dd></div>
                                  <div><dt className="text-slate-400">{uiLabel(uiLanguage, { zh: "更新时间", en: "Updated", hi: "अपडेट समय" })}</dt><dd>{adminSelectedUserChats.user.updatedAt ?? ""}</dd></div>
                                  {adminSelectedUserChats.user.disabledAt ? <div><dt className="text-slate-400">{uiLabel(uiLanguage, { zh: "禁用时间", en: "Disabled", hi: "अक्षम समय" })}</dt><dd>{adminSelectedUserChats.user.disabledAt}</dd></div> : null}
                                  <div><dt className="text-slate-400">{uiLabel(uiLanguage, { zh: "公司 / 职位", en: "Company / Title", hi: "कंपनी / पद" })}</dt><dd>{adminSelectedUserChats.user.profileCompany || "-"} {adminSelectedUserChats.user.profileTitle || ""}</dd></div>
                                  <div><dt className="text-slate-400">{uiLabel(uiLanguage, { zh: "地区", en: "Location", hi: "स्थान" })}</dt><dd>{adminSelectedUserChats.user.profileLocation || "-"}</dd></div>
                                  <div><dt className="text-slate-400">{uiLabel(uiLanguage, { zh: "个性签名", en: "Signature", hi: "हस्ताक्षर" })}</dt><dd className="whitespace-pre-wrap">{adminSelectedUserChats.user.profileSignature || "-"}</dd></div>
                                  <div><dt className="text-slate-400">{uiLabel(uiLanguage, { zh: "个人简介", en: "Bio", hi: "परिचय" })}</dt><dd className="whitespace-pre-wrap">{adminSelectedUserChats.user.profileBio || "-"}</dd></div>
                                </dl>
                              </div>
                              <div className="max-h-[42vh] space-y-3 overflow-auto pr-1">
                                {filteredAdminUserChats.length === 0 ? <p className="text-slate-400">{t.adminNoResults}</p> : null}
                                {filteredAdminUserChats.map((conversation) => (
                                  <div key={conversation.id} className="rounded-2xl border border-line bg-white">
                                    <div className="border-b border-line px-3 py-2">
                                      <p className="font-medium text-ink">{conversation.title || conversation.id} <span className="text-slate-400">{conversation.type}</span></p>
                                      <p className="text-slate-500">{t.adminMembers}: {conversation.members.map((member) => member.nickname).join(", ")} · {t.adminMessageCount}: {conversation.messageCount}</p>
                                    </div>
                                    <div className="space-y-2 px-3 py-2">
                                      {conversation.messages.length === 0 ? <p className="text-slate-400">{t.adminNoMessages}</p> : null}
                                      {conversation.messages.map((message) => (
                                        <div key={message.id} className="rounded-2xl border border-line bg-white/80 px-3 py-2">
                                          <p className="font-medium text-ink">{message.senderName} <span className="text-slate-400">{message.type} · {message.createdAt}</span></p>
                                          {message.body ? <p className="mt-1 whitespace-pre-wrap text-slate-700">{message.body}</p> : null}
                                          {message.mediaUrl ? <p className="mt-1 break-all text-slate-500">{message.mediaUrl}</p> : null}
                                          {message.translations.length > 0 ? (
                                            <div className="mt-2 space-y-1 border-l-2 border-line pl-2 text-slate-500">
                                              {message.translations.map((translation) => <p key={`${message.id}-${translation.language}`}>{translation.language}: {translation.body}</p>)}
                                            </div>
                                          ) : null}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        ) : null}
                        <div className={`${adminDashboardTab === "users" ? "grid" : "hidden"} mt-4 gap-4 lg:grid-cols-2`}>
                          <div className="rounded-2xl border border-line bg-white">
                            <div className="border-b border-line px-3 py-2">
                              <p className="text-xs font-medium text-ink">{t.adminUsers}</p>
                              <div className="mt-2 flex items-center gap-2 rounded-2xl border border-line bg-white px-2 py-1 text-xs text-slate-500">
                                <Search size={14} />
                                <input className="min-w-0 flex-1 bg-transparent outline-none" placeholder={t.adminSearchUsers} value={adminUserQuery} onChange={(event) => setAdminUserQuery(event.target.value)} />{adminUserQuery ? <button className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-paper hover:text-ink" onClick={() => setAdminUserQuery("")} type="button" aria-label={uiLabel(uiLanguage, { zh: "清空搜索", en: "Clear search", hi: "खोज साफ करें" })}>×</button> : null}
                              </div>
                            </div>
                            <div className="max-h-[56vh] overflow-auto">
                              {filteredAdminUsers.length === 0 ? <p className="px-3 py-3 text-xs text-slate-400">{t.adminNoResults}</p> : null}
                              {filteredAdminUsers.map((user) => (
                                <div key={user.id} className="border-b border-line px-3 py-2 text-xs last:border-b-0">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="font-medium text-ink">{user.nickname} <span className="text-slate-400">{user.role}</span></p>
                                      <p className="truncate text-slate-500">{user.email ?? user.phone ?? user.id}</p>
                                      <p className="text-slate-400">{user.disabledAt ? t.adminDisabledUsers : user.createdAt}</p>
                                    </div>
                                    <div className="flex shrink-0 flex-col gap-1">
                                      <button className="rounded border border-line px-2 py-1 font-medium text-ink hover:border-brand disabled:opacity-60" disabled={adminUserChatsLoadingId === user.id} type="button" onClick={() => void loadAdminUserChats(user)}>{adminUserChatsLoadingId === user.id ? "..." : t.adminViewChats}</button>
                                      {user.id !== currentUser?.id ? (
                                        <>
                                          <button className="rounded border border-line px-2 py-1 font-medium text-ink hover:border-brand disabled:opacity-60" disabled={adminActionUserId === user.id} type="button" onClick={() => void setAdminUserDisabled(user, !user.disabledAt)}>{user.disabledAt ? t.adminEnableUser : t.adminDisableUser}</button>
                                          <button className="rounded border border-line px-2 py-1 font-medium text-ink hover:border-brand disabled:opacity-60" disabled={adminActionUserId === user.id} type="button" onClick={() => void resetAdminUserPassword(user)}>{t.adminResetPassword}</button>
                                        </>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="rounded-2xl border border-line bg-white">
                            <div className="border-b border-line px-3 py-2">
                              <p className="text-xs font-medium text-ink">{t.adminFeedbackQueue}</p>
                              <div className="mt-2 flex items-center gap-2 rounded-2xl border border-line bg-white px-2 py-1 text-xs text-slate-500">
                                <Search size={14} />
                                <input className="min-w-0 flex-1 bg-transparent outline-none" placeholder={t.adminSearchFeedback} value={adminFeedbackQuery} onChange={(event) => setAdminFeedbackQuery(event.target.value)} />{adminFeedbackQuery ? <button className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-paper hover:text-ink" onClick={() => setAdminFeedbackQuery("")} type="button" aria-label={uiLabel(uiLanguage, { zh: "清空搜索", en: "Clear search", hi: "खोज साफ करें" })}>×</button> : null}
                              </div>
                            </div>
                            <div className="max-h-[56vh] overflow-auto">
                              {filteredAdminFeedback.length === 0 ? <p className="px-3 py-3 text-xs text-slate-400">{t.adminNoResults}</p> : null}
                              {filteredAdminFeedback.map((feedback) => (
                                <div key={feedback.id} className="border-b border-line px-3 py-2 text-xs last:border-b-0">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="font-medium text-ink">{feedback.user.nickname} <span className="text-slate-400">{feedback.category} · {feedback.status}</span></p>
                                      <p className="line-clamp-2 text-slate-500">{feedback.message}</p>
                                      <p className="truncate text-slate-400">{feedback.attachmentUrl ?? feedback.createdAt}</p>
                                    </div>
                                    <div className="flex shrink-0 flex-col gap-1">
                                      <button className="rounded border border-line px-2 py-1 font-medium text-ink hover:border-brand disabled:opacity-60" disabled={adminFeedbackActionId === feedback.id} type="button" onClick={() => void updateAdminFeedbackStatus(feedback, "in_review")}>{t.adminMarkInReview}</button>
                                      <button className="rounded border border-line px-2 py-1 font-medium text-ink hover:border-brand disabled:opacity-60" disabled={adminFeedbackActionId === feedback.id} type="button" onClick={() => void updateAdminFeedbackStatus(feedback, "resolved")}>{t.adminMarkResolved}</button>
                                      <button className="rounded border border-line px-2 py-1 font-medium text-ink hover:border-brand disabled:opacity-60" disabled={adminFeedbackActionId === feedback.id} type="button" onClick={() => void updateAdminFeedbackStatus(feedback, "dismissed")}>{t.adminMarkDismissed}</button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className={`${adminDashboardTab === "conversations" ? "block" : "hidden"} mt-4 rounded-2xl border border-line bg-white`}>
                          <div className="border-b border-line px-3 py-2">
                            <p className="text-xs font-medium text-ink">{t.adminRecentConversations}</p>
                            <div className="mt-2 flex items-center gap-2 rounded-2xl border border-line bg-white px-2 py-1 text-xs text-slate-500">
                              <Search size={14} />
                              <input className="min-w-0 flex-1 bg-transparent outline-none" placeholder={t.adminSearchConversations} value={adminConversationQuery} onChange={(event) => setAdminConversationQuery(event.target.value)} />{adminConversationQuery ? <button className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-paper hover:text-ink" onClick={() => setAdminConversationQuery("")} type="button" aria-label={uiLabel(uiLanguage, { zh: "清空搜索", en: "Clear search", hi: "खोज साफ करें" })}>×</button> : null}
                            </div>
                          </div>
                          <div className="max-h-[34vh] overflow-auto">
                            {filteredAdminConversations.length === 0 ? <p className="px-3 py-3 text-xs text-slate-400">{t.adminNoResults}</p> : null}
                            {filteredAdminConversations.map((conversation) => (
                              <div key={conversation.id} className="border-b border-line px-3 py-2 text-xs last:border-b-0">
                                <p className="font-medium text-ink">{conversation.title || conversation.id} <span className="text-slate-400">{conversation.type}</span></p>
                                <p className="text-slate-500">{t.adminMembers}: {conversation.memberCount} · {t.adminMessageCount}: {conversation.messageCount}</p>
                                <p className="truncate text-slate-400">{conversation.members.map((member) => member.nickname).join(", ")}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                        </div>,
                  document.body
                ) : null}
                <form className="rounded-2xl border border-line bg-white p-4" onSubmit={submitFeedback}>
                  <p className="text-sm font-medium text-ink">{t.feedbackTitle}</p>
                  <p className="mt-1 text-xs text-slate-500">{t.feedbackHint}</p>
                                    <textarea className="mt-3 min-h-24 w-full resize-y rounded border border-line px-3 py-2 text-sm outline-none focus:border-brand" maxLength={2000} placeholder={t.feedbackPlaceholder} value={feedbackMessage} onChange={(event) => setFeedbackMessage(event.target.value)} />
                  <input ref={feedbackFileInputRef} className="hidden" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleFeedbackAttachmentChange} />
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <button className="rounded border border-line px-3 py-2 font-medium text-ink hover:border-brand disabled:opacity-60" disabled={feedbackAttachmentUploading} onClick={() => feedbackFileInputRef.current?.click()} type="button">
                      {feedbackAttachmentUploading ? `${t.uploadingMedia} ${feedbackAttachmentProgress}%` : t.feedbackAttach}
                    </button>
                    {feedbackAttachment ? (
                      <button className="rounded border border-line px-3 py-2 font-medium text-coral hover:border-coral" onClick={() => setFeedbackAttachment(null)} type="button">
                        {t.feedbackAttachmentRemove}
                      </button>
                    ) : null}
                    {feedbackAttachment ? <span>{feedbackAttachment.fileName}</span> : null}
                  </div>
                  <button className="mt-3 h-10 w-full rounded bg-brand text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60" disabled={feedbackSaving || feedbackMessage.trim().length < 5} type="submit">
                    {feedbackSaving ? t.feedbackSending : t.feedbackSend}
                  </button>
                </form>
                <button className="w-full rounded border border-line px-3 py-3 text-center text-sm font-medium text-coral hover:border-coral" onClick={logout}>
                  {uiLabel(uiLanguage, { zh: "退出登录", en: "Sign out", hi: "लॉगआउट" })}
                </button>
              </div>
            ) : null}
          </section>
        </aside>

        {welcomeOpen && !welcomeDismissed ? (
          <section className={`${mobilePane === "list" ? "hidden lg:flex" : "flex"} min-h-0 flex-1 flex-col overflow-auto bg-[linear-gradient(180deg,rgba(238,247,248,0.72),rgba(255,255,255,0.88))]`}>
            <header className="flex min-h-[76px] shrink-0 items-center justify-between gap-3 border-b border-white/70 bg-white/75 px-4 backdrop-blur-xl">
              <div className="flex min-w-0 items-center gap-3">
                <button aria-label={uiLabel(uiLanguage, { zh: "返回聊天", en: "Back to chats", hi: "चैट पर वापस" })} className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-line bg-white text-ink shadow-sm hover:border-brand lg:hidden" onClick={() => setMobilePane("list")} title={uiLabel(uiLanguage, { zh: "返回聊天", en: "Back to chats", hi: "चैट पर वापस" })} type="button">
                  <ArrowLeft size={18} />
                </button>
                <Avatar name={currentUser?.nickname ?? "Me"} url={profileAvatarPreviewUrl || profileAvatarUrl || currentUser?.avatarUrl} />
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-ink">{uiLanguage === "zh" ? `欢迎回来，${currentUser?.nickname ?? ""}` : uiLanguage === "hi" ? `वापसी पर स्वागत है, ${currentUser?.nickname ?? ""}` : `Welcome back, ${currentUser?.nickname ?? ""}`}</p>
                  <p className="truncate text-sm text-slate-500">{filtered[0]
                    ? uiLabel(uiLanguage, { zh: "今天可以从最近会话或联系人开始", en: "Start from recent chats or contacts today", hi: "आज हाल की चैट या संपर्कों से शुरू करें" })
                    : uiLabel(uiLanguage, { zh: "添加联系人或与智能助手开始聊天", en: "Add a contact or start with the assistant", hi: "संपर्क जोड़ें या सहायक से चैट शुरू करें" })}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="grid h-10 w-10 place-items-center rounded border border-line text-ink hover:border-brand" onClick={() => { setFavoritesSendMode(true); setFavoritesOpen(true); void loadFavorites(); }} type="button" aria-label={uiLabel(uiLanguage, { zh: "收藏", en: "Favorites", hi: "पसंदीदा" })} title={uiLabel(uiLanguage, { zh: "收藏", en: "Favorites", hi: "पसंदीदा" })}><Star size={18} /></button>
                <button className="grid h-10 w-10 place-items-center rounded border border-line text-ink hover:border-brand" onClick={() => setWelcomeDismissed(true)} type="button" aria-label={uiLabel(uiLanguage, { zh: "进入聊天", en: "Enter chats", hi: "चैट में जाएं" })} title={uiLabel(uiLanguage, { zh: "进入聊天", en: "Enter chats", hi: "चैट में जाएं" })}><MessageCircle size={18} /></button>
              </div>
            </header>
            <div className="grid min-h-0 flex-1 gap-8 px-5 py-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:px-8 lg:py-10 xl:px-12">
              <div className="flex max-w-3xl flex-col justify-center">
                <div className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5 text-sm font-semibold text-brand shadow-sm"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />{uiLabel(uiLanguage, { zh: "登录成功 · 实时服务已连接", en: "Signed in · Realtime connected", hi: "लॉगिन सफल · रीयलटाइम सेवा जुड़ी है" })}</div>
                <h2 className="text-4xl font-semibold leading-tight text-ink sm:text-5xl">{uiLabel(uiLanguage, { zh: "从一次清晰的跨语言对话开始。", en: "Start with one clear cross-language conversation.", hi: "एक स्पष्ट बहुभाषी बातचीत से शुरू करें." })}</h2>
                <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600">{filtered.length ? uiLabel(uiLanguage, { zh: "Glimpse Chat 会保留原文、译文、文件和联系人上下文。你可以打开最近会话，也可以添加联系人开始新的沟通。", en: "Glimpse Chat keeps originals, translations, files, and contact context together. Open a recent chat or add a contact to start a new conversation.", hi: "Glimpse Chat मूल, अनुवाद, फाइलें और संपर्क संदर्भ साथ रखता है। हाल की चैट खोलें या संपर्क जोड़ें." }) : uiLabel(uiLanguage, { zh: "你还没有聊天会话。请添加新联系人开始聊天，或者直接与 Glimpse 智能助手对话。", en: "You do not have any chats yet. Add a new contact to start chatting, or talk directly with Glimpse Assistant.", hi: "अभी कोई चैट नहीं है। नया संपर्क जोड़ें या Glimpse Assistant से बात करें।" })}</p>
                <div className="mt-7 grid gap-3 sm:flex sm:flex-wrap">
                  {filtered[0] ? <button className="inline-flex h-11 items-center justify-center gap-2 rounded bg-brand px-5 text-sm font-semibold text-white hover:bg-teal-800" onClick={() => { setWelcomeDismissed(true); selectConversation(filtered[0]!.id); }} type="button"><MessageCircle size={17} />{uiLabel(uiLanguage, { zh: "打开最近会话", en: "Open recent chat", hi: "हाल की चैट खोलें" })}</button> : <button className="inline-flex h-11 items-center justify-center gap-2 rounded bg-brand px-5 text-sm font-semibold text-white hover:bg-teal-800" onClick={() => { setWelcomeDismissed(true); setTab("contacts"); setMobilePane("list"); }} type="button"><UserPlus size={17} />{uiLabel(uiLanguage, { zh: "添加联系人开始聊天", en: "Add a contact to chat", hi: "चैट के लिए संपर्क जोड़ें" })}</button>}
                  <button className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-brand/30 bg-brand/5 px-5 text-sm font-semibold text-brand hover:border-brand" onClick={() => setAssistantOpen(true)} type="button"><Bot size={17} />{uiLabel(uiLanguage, { zh: "与智能助手聊天", en: "Chat with Assistant", hi: "Assistant से चैट करें" })}</button>
                  <button className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-line bg-white px-5 text-sm font-semibold text-ink hover:border-brand" onClick={() => void startSelfConversation()} type="button"><MessageCircle size={17} />{uiLabel(uiLanguage, { zh: "给自己发消息", en: "Message myself", hi: "खुद को संदेश भेजें" })}</button>
                 <button className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-line bg-white px-5 text-sm font-semibold text-ink hover:border-brand" onClick={() => { setWelcomeDismissed(true); setTab("contacts"); setMobilePane("list"); }} type="button"><UserPlus size={17} />{uiLabel(uiLanguage, { zh: "添加联系人", en: "Add contact", hi: "संपर्क जोड़ें" })}</button>
                  <button className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-line bg-white px-5 text-sm font-semibold text-ink hover:border-brand" onClick={() => { setWelcomeDismissed(true); setTab("contacts"); setGroupModalOpen(true); }} type="button"><Users size={17} />{uiLabel(uiLanguage, { zh: "创建群聊", en: "Create group", hi: "समूह चैट बनाएं" })}</button>
                </div>
                <div className="mt-7 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-line bg-white p-4"><p className="text-2xl font-semibold text-ink">{filtered.length}</p><p className="mt-1 text-sm text-slate-500">{uiLabel(uiLanguage, { zh: "个会话等待查看", en: "chats available", hi: "चैट उपलब्ध" })}</p></div>
                  <div className="rounded-2xl border border-line bg-white p-4"><p className="text-2xl font-semibold text-ink">CN/EN</p><p className="mt-1 text-sm text-slate-500">{uiLabel(uiLanguage, { zh: "双语显示已启用", en: "bilingual display", hi: "द्विभाषी प्रदर्शन" })}</p></div>
                  <div className="rounded-2xl border border-line bg-white p-4"><p className="text-2xl font-semibold text-ink">5m</p><p className="mt-1 text-sm text-slate-500">{uiLabel(uiLanguage, { zh: "语音消息上限", en: "voice message limit", hi: "वॉइस संदेश सीमा" })}</p></div>
                </div>
              </div>
              <aside className="rounded-2xl border border-line bg-white shadow-xl">
                <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-4">
                  <div><p className="font-semibold text-ink">{uiLabel(uiLanguage, { zh: "工作区状态", en: "Workspace status", hi: "कार्यस्थल स्थिति" })}</p><p className="text-sm text-slate-500">{uiLabel(uiLanguage, { zh: "当前设置适合中英互译沟通", en: "Current setup is ready for bilingual work", hi: "वर्तमान सेटिंग बहुभाषी संवाद के लिए तैयार है" })}</p></div>
                  <span className="rounded-full border border-line px-3 py-1 text-sm font-semibold text-brand">{GLIMPSE_CHAT_VERSION}</span>
                </div>
                <div className="space-y-4 p-4">
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                    <div className="rounded-2xl border border-line bg-white/80 p-3"><p className="text-xs text-slate-500">{uiLabel(uiLanguage, { zh: "来源", en: "Source", hi: "स्रोत" })}</p><p className="font-semibold text-ink">{uiLabel(uiLanguage, { zh: "自动识别", en: "Auto detect", hi: "स्वचालित पहचान" })}</p></div>
                    <RefreshCw className="text-brand" size={18} />
                    <div className="rounded-2xl border border-line bg-white/80 p-3"><p className="text-xs text-slate-500">{uiLabel(uiLanguage, { zh: "目标", en: "Target", hi: "लक्ष्य" })}</p><p className="font-semibold text-ink">{translationLanguageDisplayNames[translationTargetLanguage]?.[uiLanguage] ?? TRANSLATION_LANGUAGE_OPTIONS.find((item) => item.code === translationTargetLanguage)?.label ?? translationTargetLanguage}</p></div>
                  </div>
                  <div className="rounded-2xl border border-line bg-white/80 p-4 text-sm text-slate-600"><p className="font-semibold text-ink">{uiLabel(uiLanguage, { zh: "开始第一次真实对话", en: "Start your first real conversation", hi: "पहली वास्तविक बातचीत शुरू करें" })}</p><p className="mt-2 leading-6">{uiLabel(uiLanguage, { zh: "添加联系人后，这里会显示你的真实聊天内容；系统不会创建演示联系人或演示消息。", en: "After adding a contact, your real chats will appear here. The app does not create demo contacts or demo messages.", hi: "संपर्क जोड़ने के बाद वास्तविक चैट यहाँ दिखेगी। ऐप डेमो संपर्क या संदेश नहीं बनाएगा।" })}</p></div>
                </div>
                <div className="divide-y divide-line border-t border-line text-sm">
                  {[
                    uiLabel(uiLanguage, { zh: "通知权限：浏览器通知已准备", en: "Notifications: browser alerts are ready", hi: "नोटिफिकेशन: ब्राउज़र अलर्ट तैयार हैं" }),
                    uiLabel(uiLanguage, { zh: "资料完整度：昵称、头像、公开 ID 可用于搜索", en: "Profile: nickname, avatar, and public ID support search", hi: "प्रोफाइल: उपनाम, अवतार और सार्वजनिक ID खोज में उपलब्ध हैं" }),
                    uiLabel(uiLanguage, { zh: "文件与语音：资料会在聊天资料中归档", en: "Files and voice: media is archived in chat details", hi: "फाइल और वॉइस: मीडिया चैट विवरण में संग्रहित होगा" })
                  ].map((item) => <div key={item} className="flex items-center gap-3 px-4 py-3"><span className="grid h-6 w-6 place-items-center rounded-full bg-brand/10 text-brand"><Check size={14} /></span><span className="text-slate-600">{item}</span></div>)}
                </div>
              </aside>
            </div>
          </section>
        ) : (
        <section className={`${mobilePane === "list" ? "hidden lg:flex" : "flex"} min-h-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(238,247,248,0.72),rgba(255,255,255,0.88))]`}>
          {!selectedExists ? <div className="grid h-full min-h-0 place-items-center p-6 text-center"><div className="max-w-lg rounded-3xl border border-line bg-white/90 p-7 shadow-xl"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand/10 text-brand"><MessageCircle size={26} /></span><h2 className="mt-4 text-xl font-semibold text-ink">{uiLabel(uiLanguage, { zh: "还没有聊天会话", en: "No chats yet", hi: "अभी कोई चैट नहीं" })}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{uiLabel(uiLanguage, { zh: "添加新联系人开始聊天，或者先和 Glimpse 智能助手对话。正式版不会显示演示聊天窗口。", en: "Add a new contact to start chatting, or talk with Glimpse Assistant. No demo chat is shown in the production app.", hi: "नया संपर्क जोड़ें या Glimpse Assistant से बात करें। प्रोडक्शन ऐप में डेमो चैट नहीं दिखाई जाती।" })}</p><div className="mt-5 flex flex-wrap justify-center gap-3"><button className="inline-flex h-11 items-center gap-2 rounded bg-brand px-4 font-semibold text-white" onClick={() => { setTab("contacts"); setMobilePane("list"); }} type="button"><UserPlus size={17} />{uiLabel(uiLanguage, { zh: "添加联系人", en: "Add contact", hi: "संपर्क जोड़ें" })}</button><button className="inline-flex h-11 items-center gap-2 rounded border border-line bg-white px-4 font-semibold text-ink hover:border-brand" onClick={() => setAssistantOpen(true)} type="button"><Bot size={17} />{uiLabel(uiLanguage, { zh: "智能助手", en: "Assistant", hi: "सहायक" })}</button></div></div></div> : <>
          <header className="flex min-h-[76px] items-center gap-3 border-b border-white/70 bg-white/75 px-3 backdrop-blur-xl sm:px-4">
            <button aria-label={uiLabel(uiLanguage, { zh: "返回聊天", en: "Back to chats", hi: "चैट पर वापस" })} className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-line bg-white text-ink shadow-sm hover:border-brand lg:hidden" onClick={() => setMobilePane("list")} title={uiLabel(uiLanguage, { zh: "返回聊天", en: "Back to chats", hi: "चैट पर वापस" })} type="button">
              <ArrowLeft size={18} />
            </button>
            <button aria-label={selected.type === "group" ? t.groupManage : t.viewContactDetails} className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 py-1.5 text-left transition hover:bg-white/70" onClick={openSelectedDetails} type="button">
              <span className="shrink-0"><Avatar name={displayConversationName(selected)} url={selected.type === "single" && isSelfConversation(selected) ? ownAvatarUrl : selected.avatarUrl} kind={selected.type === "group" ? "group" : "user"} online={selected.type === "single" ? selectedPeerOnline : undefined} /></span>
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-lg font-semibold text-ink">{displayConversationName(selected)}</span>
                  {selected.type === "group" ? <span aria-label={connectionStatusLabels[uiLanguage][connectionState]} className={`h-2.5 w-2.5 shrink-0 rounded-full ${connectionState === "connected" ? "bg-emerald-500" : connectionState === "offline" ? "bg-coral" : "bg-amber-400"}`} title={connectionStatusLabels[uiLanguage][connectionState]} /> : null}
                </span>
                {selected.type === "group" ? <OverflowMarqueeText className="text-sm text-slate-500" text={chatHeaderSubtitle} /> : <span className="block truncate text-sm text-slate-500" title={chatHeaderSubtitle}>{chatHeaderSubtitle}</span>}
              </span>
            </button>
          </header>
          {typingUserNames.length > 0 ? <div className="border-line border-b bg-white px-4 py-1.5 text-xs text-brand">{typingUserNames.join(", ")} {t.typing}</div> : null}
          {selected.type === "group" && selected.announcement && (selected.announcementScroll === false || groupAnnouncementDismissedForId !== selected.id) ? (
            <div className="border-line border-b bg-amber-50 px-4 py-2 text-sm text-amber-900">
              <div className="flex min-w-0 items-center gap-2 overflow-hidden">
                <span className="shrink-0 font-medium">{t.groupAnnouncement}</span>
                <div className="min-w-0 flex-1 overflow-hidden">
                  <p key={`${selected.id}-${selected.announcement}-${selected.announcementScroll}`} className={selected.announcementScroll === false ? "whitespace-pre-wrap" : "inline-block min-w-full whitespace-nowrap"} style={selected.announcementScroll === false ? undefined : { animation: "glimpse-group-announcement-marquee 8s linear 3" }} onAnimationEnd={() => setGroupAnnouncementDismissedForId(selected.id)}>{selected.announcement}</p>
                </div>
              </div>
            </div>
          ) : null}
          {notice ? <div className="border-line border-b bg-white px-4 py-2 text-sm text-brand">{notice}</div> : null}
          {messageSelectMode ? (
            <div className="border-line flex shrink-0 items-center gap-2 border-t bg-paper px-4 py-2 text-sm">
              <span className="min-w-0 flex-1 text-slate-600">{selectedMessageIds.size} {uiLabel(uiLanguage, { zh: "已选", en: "selected", hi: "चुने गए" })}</span>
              <button className="rounded-2xl border border-line bg-white px-3 py-1.5 font-medium text-ink hover:border-brand" onClick={() => openForwardMessages(selectedMessagesForCurrentConversation())} type="button">{uiLabel(uiLanguage, { zh: "转发", en: "Forward", hi: "फ़ॉरवर्ड" })}</button>
              <button className="rounded-2xl border border-line bg-white px-3 py-1.5 font-medium text-ink hover:border-brand" onClick={() => openForwardMessages(selectedMessagesForCurrentConversation(), "merged")} type="button">{uiLabel(uiLanguage, { zh: "合并转发", en: "Merge forward", hi: "मर्ज करके फ़ॉरवर्ड" })}</button>
              <button className="rounded-2xl border border-line bg-white px-3 py-1.5 font-medium text-ink hover:border-brand" onClick={() => void favoriteSelectedMessages()} type="button">{uiLabel(uiLanguage, { zh: "收藏", en: "Favorite", hi: "पसंदीदा" })}</button>
              <button className="rounded-2xl border border-line bg-white px-3 py-1.5 font-medium text-ink hover:border-brand" onClick={() => void copySelectedMessagesMerged()} type="button">{uiLabel(uiLanguage, { zh: "合并复制", en: "Merge copy", hi: "मर्ज करके कॉपी" })}</button>
              <button className="rounded border border-coral bg-white px-3 py-1.5 font-medium text-coral hover:bg-coral/10" onClick={deleteSelectedMessagesLocally} type="button">{uiLabel(uiLanguage, { zh: "删除", en: "Delete", hi: "हटाएं" })}</button>
              <button className="rounded-2xl border border-line bg-white px-3 py-1.5 font-medium text-ink hover:border-brand" onClick={cancelMessageSelection} type="button">{uiLabel(uiLanguage, { zh: "取消", en: "Cancel", hi: "रद्द करें" })}</button>
            </div>
          ) : null}
          <div ref={messageListRef} className="min-h-0 flex-1 space-y-4 overflow-auto bg-[linear-gradient(180deg,rgba(238,247,248,0.60),rgba(255,255,255,0.75))] px-4 py-5 pb-4">
            {!selectedExists ? (
              <div className="grid min-h-[280px] place-items-center text-center text-sm text-slate-500">
                <p>{t.noConversations}</p>
              </div>
            ) : selectedMessageLoadState === "loading" && currentMessages.length === 0 ? (
              <div className="grid min-h-[280px] place-items-center text-center text-sm text-slate-500">
                <p>{t.loadingMessages}</p>
              </div>
            ) : selectedMessageLoadState === "failed" && currentMessages.length === 0 ? (
              <div className="grid min-h-[280px] place-items-center text-center text-sm text-slate-500">
                <div className="space-y-3">
                  <p>{t.messagesFailed}</p>
                  <button className="rounded-2xl border border-line bg-white px-3 py-2 font-medium text-ink hover:border-brand" onClick={() => joinConversation(selected.id)} type="button">
                    {messageActionLabels[uiLanguage].retry}
                  </button>
                </div>
              </div>
            ) : currentMessages.length === 0 ? (
              <div className="grid min-h-[280px] place-items-center text-center text-sm text-slate-500">
                <p>{t.emptyConversation}</p>
              </div>
            ) : null}
            {selectedExists && historyCursors[selected.id] ? (
              <div className="flex justify-center">
                <button className="rounded-2xl border border-line bg-white px-3 py-2 text-sm font-medium text-ink hover:border-brand disabled:opacity-50" disabled={historyLoading} onClick={loadOlderMessages} type="button">
                  {historyLoading ? t.loadingOlder : t.loadOlder}
                </button>
              </div>
            ) : null}
            {selectedExists && !historyCursors[selected.id] && historyEndReached[selected.id] && currentMessages.length > 0 ? (
              <div className="flex justify-center">
                <span className="rounded bg-white px-3 py-1 text-xs text-slate-400 shadow-sm">{t.noMoreMessages}</span>
              </div>
            ) : null}
            {currentMessages.map((message, messageIndex) => {
              const mine = message.senderId === currentUser?.id;
              const translationEditNotice = message.type === "text" ? parseTranslationEditNotice(message.body) : null;
              if (translationEditNotice) {
                return (
                  <article id={`message-${message.id}`} key={message.id} className="flex justify-center px-2" data-translation-edit-notice={translationEditNotice.targetMessageId}>
                    <button
                      className={`max-w-full rounded-full border px-3 py-1.5 text-xs shadow-sm transition hover:border-brand hover:text-brand ${highlightedMessageIds[message.id] ? "message-new-attention border-brand bg-brand/10 text-brand" : "border-line bg-white/90 text-slate-500"}`}
                      onClick={() => void jumpToQuotedMessage(translationEditNotice.targetMessageId)}
                      title={uiLabel(uiLanguage, { zh: "点击定位到修改的消息", en: "Go to the edited message", hi: "संपादित संदेश पर जाएं" })}
                      type="button"
                    >
                      {translationEditNoticeLabel(translationEditNotice.editorName, uiLanguage)}
                    </button>
                  </article>
                );
              }
              const previousMessage = currentMessages[messageIndex - 1];
             const explicitAlbumKey = isAlbumMediaMessage(message) && message.albumId
                ? message.senderId + ":" + message.albumId
                : undefined;
              const isAlbumContinuation = explicitAlbumKey
                ? renderedAlbumIds.has(explicitAlbumKey)
                : Boolean(
                    isAlbumMediaMessage(message) &&
                      previousMessage &&
                      isAlbumMediaMessage(previousMessage) &&
                      previousMessage.type === message.type &&
                      previousMessage.senderId === message.senderId &&
                      Math.abs(new Date(message.createdAt).getTime() - new Date(previousMessage.createdAt).getTime()) <= 180000
                  );
              if (isAlbumContinuation) return null;
              if (explicitAlbumKey) renderedAlbumIds.add(explicitAlbumKey);
              const albumImages: MessagePayload[] = explicitAlbumKey
                ? currentMessages
                    .filter((candidate) => isAlbumMediaMessage(candidate) && candidate.senderId === message.senderId && candidate.albumId === message.albumId)
                    .sort((left, right) => (left.albumIndex ?? 0) - (right.albumIndex ?? 0))
                : [];
              if (!explicitAlbumKey && isAlbumMediaMessage(message)) {
                for (let index = messageIndex; index < currentMessages.length; index += 1) {
                  const candidate = currentMessages[index];
                  if (!candidate) break;
                  if (
                    isAlbumMediaMessage(candidate) &&
                    candidate.type === message.type &&
                    candidate.senderId === message.senderId &&
                   Math.abs(new Date(candidate.createdAt).getTime() - new Date(message.createdAt).getTime()) <= 180000
                  ) {
                    albumImages.push(candidate);
                  } else {
                    break;
                  }
                }
              }
              const status = mine ? messageStatuses[message.id] ?? "delivered" : undefined;
              const messageTime = formatMessageTime(message.createdAt);
              const statusIndicator = status && (showMessageReadStatus || status === "sending" || status === "failed") ? (
                <span className="ml-1 inline-flex items-center align-middle" data-message-status={status} title={messageStatusLabels[uiLanguage][status]} aria-label={messageStatusLabels[uiLanguage][status]}>
                  {status === "sending" ? <span>{messageStatusLabels[uiLanguage][status]}</span> : null}
                  {status === "sent" ? <Check size={14} strokeWidth={2.4} /> : null}
                  {status === "delivered" ? <CheckCheck size={14} strokeWidth={2.4} /> : null}
                  {status === "read" ? <CheckCheck className="text-sky-500" size={14} strokeWidth={2.4} /> : null}
                  {status === "failed" ? <span className="text-coral">{messageStatusLabels[uiLanguage][status]}</span> : null}
                </span>
              ) : null;
              const manualTranslationTarget = getManualTranslationTarget(message);
              const translations = message.translations ?? {};
              const stickerPayload = message.type === "text" ? parseStickerMessage(message.body) : null;
              const locationPayload = message.type === "text" ? parseLocationMessage(message.body) : null;
              const isTextMessage = message.type === "text" && !locationPayload && !stickerPayload;
              const machineTranslation = isTextMessage ? translations[manualTranslationTarget] : undefined;
              const manualTranslation = isTextMessage ? message.manualTranslations?.[manualTranslationTarget] : undefined;
              const translated = manualTranslation?.body ?? machineTranslation;
              const manualTranslationParts = manualTranslation ? translationAttributionParts(manualTranslation.originalBody ?? machineTranslation ?? "", manualTranslation) : [];
              const manualTranslationRevisionsForTarget = manualTranslationRevisions(manualTranslation);
              const manualTranslationEditors = Array.from(new Map(manualTranslationRevisionsForTarget.map((revision) => [revision.editedById, revision] as const)).values());
              const isEditingTranslation = translationEditDraft?.messageId === message.id && translationEditDraft.targetLanguage === manualTranslationTarget;
              const audioTranslated = message.type === "audio" ? translations[manualTranslationTarget] : undefined;
              const isTranslationLoading = translationLoading[message.id] ?? false;
              const isVoiceTranscribing = voiceTranscriptionLoading[message.id] ?? false;
              const translationError = translationErrors[message.id];
              const showOriginal = isTextMessage && (messageDisplayMode === "original" || messageDisplayMode === "bilingual" || !translated);
              const showTranslation = isTextMessage && Boolean(machineTranslation || manualTranslation?.body) && (messageDisplayMode === "translated" || messageDisplayMode === "bilingual");
              const showAudioTranscript = visibleTranscriptIds.has(message.id) && Boolean(message.transcript?.trim());
              const showAudioOriginal = showAudioTranscript && (messageDisplayMode === "original" || messageDisplayMode === "bilingual" || !audioTranslated);
              const showAudioTranslation = showAudioTranscript && Boolean(audioTranslated) && (messageDisplayMode === "translated" || messageDisplayMode === "bilingual");
              const messageMediaUrl = mediaPreviewUrl(message);
              const messageDownload = mediaDownloadUrl(message);
              const hasMediaActionTail = Boolean(message.mediaUrl && ["image", "video", "audio", "file"].includes(message.type));
              const mediaActionTime = messageTimeDisplayMode === "tail" && messageTime && hasMediaActionTail ? (
                <span className={`inline-flex shrink-0 items-center whitespace-nowrap text-[11px] ${mine ? "text-white/65" : "text-slate-400"}`} data-message-time-position="tail" data-message-time-layout="media-actions">
                  {messageTime}{statusIndicator}
                </span>
              ) : null;
              const senderUser = messageSenderUser(message);
              const senderAvatarUrl = mine ? ownAvatarUrl : (senderUser?.avatarUrl ?? selected.avatarUrl);
              const revokeBatch = mine ? revokeBatchForMessage(message) : [];
              const selectedForMultiAction = selectedMessageIds.has(message.id);
              const swipeState = messageSwipeVisual?.messageId === message.id ? messageSwipeVisual : null;
              const swipeOffset = swipeState?.offset ?? 0;
              const swipeProgress = Math.min(1, swipeOffset / 56);
              const compactMessageActions = messageActionDisplayMode === "compact" && !message.revokedAt && isTextMessage ? (
                <span className="ml-1 inline-flex items-center gap-0.5 align-middle" data-message-actions="compact">
                  <button className={`inline-grid h-5 w-5 place-items-center rounded disabled:cursor-not-allowed disabled:opacity-35 ${mine ? "text-white/70 hover:bg-white/10 hover:text-white" : "text-slate-400 hover:bg-paper hover:text-ink"}`} disabled={isTranslationLoading} onClick={() => void refreshTranslation(message)} title={messageActionLabels[uiLanguage].translate} aria-label={messageActionLabels[uiLanguage].translate} type="button"><RefreshCw className={isTranslationLoading ? "animate-spin" : undefined} size={12} /></button>
                  <button className={`inline-grid h-5 w-5 place-items-center rounded disabled:cursor-not-allowed disabled:opacity-35 ${speakingMessageKey === message.id + ":original" ? mine ? "bg-white/15 text-white" : "bg-paper text-ink" : mine ? "text-white/70 hover:bg-white/10 hover:text-white" : "text-slate-400 hover:bg-paper hover:text-ink"}`} disabled={!message.body?.trim()} onClick={() => void readOriginalMessage(message)} title={messageActionLabels[uiLanguage].readOriginal} aria-label={messageActionLabels[uiLanguage].readOriginal} type="button"><Volume2 size={12} /></button>
                  <button className={`inline-grid h-5 w-5 place-items-center rounded disabled:cursor-not-allowed disabled:opacity-35 ${speakingMessageKey === message.id + ":translation:" + manualTranslationTarget ? mine ? "bg-white/15 text-white" : "bg-paper text-ink" : mine ? "text-white/70 hover:bg-white/10 hover:text-white" : "text-slate-400 hover:bg-paper hover:text-ink"}`} disabled={!translated} onClick={() => { if (translated) void readTranslatedMessage(message, translated, manualTranslationTarget); }} title={messageActionLabels[uiLanguage].readTranslation} aria-label={messageActionLabels[uiLanguage].readTranslation} type="button"><AudioLines size={12} /></button>
                  <button className={`inline-grid h-5 w-5 place-items-center rounded disabled:cursor-not-allowed disabled:opacity-35 ${mine ? "text-white/70 hover:bg-white/10 hover:text-white" : "text-slate-400 hover:bg-paper hover:text-ink"}`} disabled={!message.body?.trim()} onClick={() => void copyMessageText(message)} title={messageActionLabels[uiLanguage].copyOriginal} aria-label={messageActionLabels[uiLanguage].copyOriginal} type="button"><Copy size={12} /></button>
                  <button className={`inline-grid h-5 w-5 place-items-center rounded disabled:cursor-not-allowed disabled:opacity-35 ${mine ? "text-white/70 hover:bg-white/10 hover:text-white" : "text-slate-400 hover:bg-paper hover:text-ink"}`} disabled={!translated} onClick={() => { if (translated) void copyTranslatedMessageText(translated); }} title={messageActionLabels[uiLanguage].copyTranslation} aria-label={messageActionLabels[uiLanguage].copyTranslation} type="button"><CopyCheck size={12} /></button>
                </span>
              ) : null;
              return (
                <article id={`message-${message.id}`} key={message.id} className={`relative flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`} style={{ touchAction: "pan-y", transform: `translateX(${swipeOffset}px)`, transition: swipeState?.active ? "none" : "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)" }} onContextMenu={(event) => { event.preventDefault(); if (messageActionDisplayMode === "long-press" || messageActionDisplayMode === "compact") setMessageActionMenuId(message.id); else beginMessageSelect(message.id); }} onPointerDown={(event) => handleMessagePointerDown(event, message.id)} onPointerMove={handleMessagePointerMove} onPointerUp={handleMessagePointerEnd} onPointerLeave={clearMessageLongPressTimer} onPointerCancel={handleMessagePointerEnd}>
                  {swipeOffset > 0 ? <span className={`pointer-events-none absolute top-1/2 z-10 grid h-8 w-8 place-items-center rounded-full border border-brand/25 bg-white text-brand shadow-sm ${mine ? "right-1" : "left-1"}`} style={{ opacity: swipeProgress, transform: mine ? `translate(${-Math.min(28, swipeOffset * 0.35)}px, -50%) scale(${0.72 + swipeProgress * 0.28})` : `translate(${Math.min(28, swipeOffset * 0.35)}px, -50%) scale(${0.72 + swipeProgress * 0.28})` }}><Reply size={15} /></span> : null}
                  {messageSelectMode ? <button className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${selectedForMultiAction ? "border-brand bg-brand text-white" : "border-line bg-white text-transparent"}`} onClick={() => toggleSelectedMessage(message.id)} type="button" aria-label={uiLabel(uiLanguage, { zh: "选择消息", en: "Select message", hi: "संदेश चुनें" })}><Check size={14} /></button> : null}
                  {!mine ? <button type="button" className="shrink-0" onClick={() => selected.type === "group" ? openUserDetails(senderUser) : openSelectedDetails()} aria-label={t.viewContactDetails}><Avatar name={displayMessageSenderName(message)} url={senderAvatarUrl} size="sm" /></button> : null}
                  <div className={`${stickerPayload?.imageUrl ? "max-w-[240px] bg-transparent p-0 shadow-none" : "max-w-[760px] rounded-[20px] p-3 shadow-sm"} ${highlightedMessageIds[message.id] ? "message-new-attention" : ""} ${stickerPayload?.imageUrl ? mine ? "text-white" : "text-slate-500" : message.revokedAt ? "border border-line bg-white/70 text-slate-500" : mine ? "bg-brand text-white" : "border border-line bg-white text-ink"}`}>
                    {message.revokedAt ? <p className="text-sm italic">{t.messageRevoked}</p> : null}
                    {!message.revokedAt && showSenderNames ? <p className="text-sm font-medium opacity-80">{displayMessageSenderName(message)}</p> : null}
                    {!message.revokedAt && message.replyToMessageId ? (
                      <button className={`mb-2 block w-full rounded border-l-4 px-2 py-1.5 text-left text-xs ${mine ? "border-white/50 bg-white/10 text-white/80 hover:bg-white/15" : "border-brand/60 bg-paper text-slate-600 hover:bg-slate-100"}`} onClick={() => void jumpToQuotedMessage(message.replyToMessageId)} type="button">
                        <p className="font-medium">{message.replyToMessageSenderName ?? messageActionLabels[uiLanguage].reply}</p>
                        <p className="mt-0.5 line-clamp-2 break-words">{message.replyToMessageBody || `[${message.replyToMessageType ?? "message"}]`}</p>
                      </button>
                    ) : null}
                    {!message.revokedAt && albumImages.length > 1 ? (
                      <div className="mt-2 space-y-2">
                        <div className={`relative ${albumImages.length === 2 ? "grid h-48 w-72 grid-cols-2 overflow-hidden rounded-2xl border border-line bg-paper sm:h-52 sm:w-80" : "grid h-48 w-72 grid-cols-3 overflow-hidden rounded-2xl border border-line bg-paper sm:h-52 sm:w-80"}`}>
                          {albumImages.slice(0, 9).map((item, imageIndex) => (
                            <button id={`message-media-${item.id}`} key={item.id} className={`relative min-h-0 scroll-mt-20 overflow-hidden border border-white/30 bg-black/5 ${highlightedMessageIds[item.id] ? "ring-4 ring-brand ring-offset-2 glimpse-media-target-flash" : ""}`} onClick={() => openMediaGallery(albumImages, imageIndex)} type="button" aria-label={t.mediaOpen} title={item.body ?? t.mediaOpen}>
                              {item.type === "video" ? <video className="h-full w-full object-cover" src={mediaPreviewUrl(item)} poster={videoThumbnailUrl(item)} preload="metadata" muted playsInline /> : <img className="h-full w-full object-cover" src={mediaThumbnailUrl(item)} alt={item.body ?? "Album image"} />}
                              {item.type === "video" ? <span className="absolute bottom-1 left-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold text-white">▶ 视频</span> : null}
                             {imageIndex === 8 && albumImages.length > 9 ? <span className="absolute inset-0 grid place-items-center bg-black/55 text-lg font-semibold text-white">+{albumImages.length - 9}</span> : null}
                           </button>
                         ))}
                          {mediaActionTime ? <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-black/65 px-1.5 py-0.5 text-white" data-media-actions="album">{mediaActionTime}</span> : null}
                       </div>
                      </div>
                    ) : null}                    {!message.revokedAt && message.mediaUrl && message.type === "image" && !message.albumId && albumImages.length <= 1 ? (
                      <div className="mt-2 space-y-2">
                        <button className="block overflow-hidden rounded border border-black/10 bg-black/5" onClick={() => { setPreviewZoom(1); setPreviewMedia({ url: messageMediaUrl, type: "image", name: message.body }); }} type="button" aria-label={t.mediaOpen} title={t.mediaOpen}>
                          <img className="max-h-80 max-w-full object-contain" src={mediaThumbnailUrl(message)} alt={message.body ?? "Image attachment"} />
                        </button>
                        <div className="flex flex-wrap items-center gap-3 text-xs" data-media-actions="image">
                          <a className={`inline-flex items-center gap-1 underline-offset-2 hover:underline ${mine ? "text-white/80" : "text-slate-500"}`} href={messageDownload} download={message.body ?? "download"}><Download size={13} />{t.downloadOriginal}</a>
                          {mediaActionTime}
                        </div>
                      </div>
                    ) : null}
                    {!message.revokedAt && message.mediaUrl && message.type === "video" && !message.albumId && albumImages.length <= 1 ? (
                      <div className="mt-2 space-y-2">
                        <button className="block w-full overflow-hidden rounded border border-black/10 bg-black/80 text-left" onClick={() => handleVideoPreviewClick(messageMediaUrl, message.body)} onContextMenu={(event) => { event.preventDefault(); openVideoPreview(messageMediaUrl, message.body, true); }} onPointerDown={(event) => handleVideoPreviewPointerDown(event, messageMediaUrl, message.body)} onPointerUp={clearVideoPreviewLongPressTimer} onPointerLeave={clearVideoPreviewLongPressTimer} onPointerCancel={clearVideoPreviewLongPressTimer} type="button" aria-label={t.mediaOpen} title={t.mediaOpen}>
                          <video className="block h-auto max-h-80 max-w-full rounded bg-black object-contain" src={messageMediaUrl} poster={videoThumbnailUrl(message)} preload="metadata" muted playsInline />
                        </button>
                        <div className="flex flex-wrap items-center gap-3 text-xs" data-media-actions="video">
                          <a className={`inline-flex items-center gap-1 underline-offset-2 hover:underline ${mine ? "text-white/80" : "text-slate-500"}`} href={messageDownload} download={message.body ?? "download"}><Download size={13} />{t.downloadOriginal}</a>
                          {mediaActionTime}
                        </div>
                      </div>
                    ) : null}
                    {!message.revokedAt && message.mediaUrl && message.type === "audio" ? (
                      <div className={`mt-2 flex max-w-[520px] items-start gap-3 rounded border p-3 ${mine ? "border-white/20 bg-white/10" : "border-line bg-paper"}`}>
                        <Music2 className="mt-1 shrink-0" size={20} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm">{message.body ?? "Audio"}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs" data-media-actions="audio">
                            <button className="underline-offset-2 hover:underline" onClick={() => setPreviewMedia({ url: messageMediaUrl, type: "audio", name: message.body })} type="button">{t.mediaOpen}</button>
                            {mediaActionTime}
                            <button className="underline-offset-2 hover:underline disabled:opacity-60" disabled={isVoiceTranscribing} onClick={() => void toggleVoiceTranscript(message)} type="button">{isVoiceTranscribing ? uiLabel(uiLanguage, { zh: "转写中...", en: "Transcribing...", hi: "लिखित पाठ बन रहा है..." }) : visibleTranscriptIds.has(message.id) ? t.voiceTranscriptHide : t.voiceTranscript}</button>
                          </div>
                          {showAudioTranscript ? (
                            <div className="mt-2 space-y-1 rounded bg-white/70 px-2 py-1 text-sm text-ink">
                              {showAudioOriginal ? <p className="whitespace-pre-wrap break-words">{message.transcript}</p> : null}
                              {showAudioTranslation ? <p className={`${messageDisplayMode === "bilingual" ? "border-t border-line pt-1 text-slate-600" : ""} whitespace-pre-wrap break-words`}>{audioTranslated}</p> : null}
                            </div>
                          ) : null}
                          <audio className="mt-2 w-full" src={messageMediaUrl} controls preload="metadata" />
                        </div>
                        <a className="mt-1 shrink-0" href={messageDownload} download={message.body ?? "download"} title={t.downloadOriginal}><Download size={17} /></a>
                      </div>
                    ) : null}
                    {!message.revokedAt && message.mediaUrl && message.type === "file" ? (
                      <div className={`mt-2 max-w-[520px] rounded border p-3 text-sm ${mine ? "border-white/20 bg-white/10 text-white" : "border-line bg-paper text-ink"}`}>
                        <a className="flex items-center gap-3" href={messageDownload} download={message.body ?? "download"} title={message.body ?? "File attachment"}>
                          <FileText className="shrink-0" size={20} />
                          <span className="min-w-0 flex-1 truncate">{message.body ?? "File attachment"}</span>
                          <Download className="shrink-0" size={17} />
                        </a>
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs font-medium" data-media-actions="file">
                          <a className={`inline-flex items-center gap-1 underline-offset-2 hover:underline ${mine ? "text-white/80" : "text-slate-500"}`} href={messageDownload} download={message.body ?? "download"}><Download size={13} />{t.downloadOriginal}</a>
                          {mediaActionTime}
                          {isPreviewableDocument(message) ? <button className={`underline-offset-2 hover:underline ${mine ? "text-white/80" : "text-brand"}`} onClick={() => void openDocumentPreview(message)} type="button">{uiLabel(uiLanguage, { zh: "在线预览", en: "Preview", hi: "पूर्वावलोकन" })}</button> : null}
                          {isZipArchive(message) ? <button className={`underline-offset-2 hover:underline ${mine ? "text-white/80" : "text-brand"}`} onClick={() => void openArchivePreview(message)} type="button">{uiLabel(uiLanguage, { zh: "预览压缩包", en: "Preview archive", hi: "आर्काइव पूर्वावलोकन" })}</button> : null}
                        </div>
                      </div>
                    ) : null}
                    {!message.revokedAt && stickerPayload ? (
                      stickerPayload.imageUrl ? (
                        <div className="mt-1 inline-flex touch-pan-y select-none bg-transparent p-0" data-rich-sticker-only="true" onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); clearStickerLongPressTimer(); positionStickerActionMenu(stickerPayload, event.clientX, event.clientY); }} onPointerDown={(event) => { event.stopPropagation(); handleStickerPointerDown(event, stickerPayload); }} onPointerUp={() => { clearStickerLongPressTimer(); stickerLongPressTriggeredRef.current = false; }} onPointerLeave={() => { clearStickerLongPressTimer(); stickerLongPressTriggeredRef.current = false; }} onPointerCancel={() => { clearStickerLongPressTimer(); stickerLongPressTriggeredRef.current = false; }} title={stickerLabel(stickerPayload, uiLanguage)}>
                          <img className="pointer-events-none h-auto w-48 max-w-full select-none drop-shadow-sm" src={stickerPayload.imageUrl} alt={stickerLabel(stickerPayload, uiLanguage)} draggable={false} loading="lazy" />
                        </div>
                      ) : (
                        <div className={`mt-2 inline-flex min-w-32 touch-pan-y select-none flex-col items-center rounded-[24px] border p-4 text-center shadow-sm bg-gradient-to-br ${stickerPayload.tone} ${mine ? "border-white/20" : "border-line"}`} data-classic-sticker-only="true" onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); clearStickerLongPressTimer(); positionStickerActionMenu(stickerPayload, event.clientX, event.clientY); }} onPointerDown={(event) => { event.stopPropagation(); handleStickerPointerDown(event, stickerPayload); }} onPointerUp={() => { clearStickerLongPressTimer(); stickerLongPressTriggeredRef.current = false; }} onPointerLeave={() => { clearStickerLongPressTimer(); stickerLongPressTriggeredRef.current = false; }} onPointerCancel={() => { clearStickerLongPressTimer(); stickerLongPressTriggeredRef.current = false; }} title={stickerLabel(stickerPayload, uiLanguage)}>
                          <span className="text-6xl leading-none drop-shadow-sm" aria-hidden="true">{stickerPayload.emoji}</span>
                        </div>
                      )
                    ) : null}                    {!message.revokedAt && locationPayload ? (
                      <a className={`mt-2 flex max-w-sm items-center gap-3 rounded border p-3 text-left transition hover:opacity-90 ${mine ? "border-white/20 bg-white/10 text-white" : "border-line bg-paper text-ink"}`} href={locationMapUrl(locationPayload)} target="_blank" rel="noreferrer">
                        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded ${mine ? "bg-white/15" : "bg-brand text-white"}`}><MapPin size={21} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{locationMessageTitle(locationPayload)}</span>
                          <span className={`mt-1 block text-xs ${mine ? "text-white/70" : "text-slate-500"}`}>{locationPayload.latitude.toFixed(6)}, {locationPayload.longitude.toFixed(6)}</span>
                        </span>
                      </a>
                    ) : null}
                    {!message.revokedAt && message.mediaUrl && !["file", "audio"].includes(message.type) && message.body ? <p className="mt-2 break-words text-sm opacity-80">{renderMentionText(message.body.trimEnd(), mine)}</p> : null}
                    {!message.revokedAt && showOriginal ? <p className="mt-1 whitespace-pre-wrap break-words text-base leading-6">{renderMentionText((message.body ?? "").trimEnd(), mine)}{messageTimeDisplayMode === "tail" && messageTime ? <span className={`ml-2 inline whitespace-nowrap align-baseline text-[11px] ${mine ? "text-white/65" : "text-slate-400"}`} data-message-time-position="tail">{messageTime}{statusIndicator}{compactMessageActions}</span> : messageTimeDisplayMode === "hidden" ? <>{statusIndicator}{compactMessageActions}</> : null}</p> : null}
                    {!message.revokedAt && showTranslation ? (
                      <div className={`mt-2 whitespace-pre-wrap break-words rounded border p-2 text-base leading-6 ${messageDisplayMode === "translated" ? "border-transparent p-0" : mine ? "border-white/25 bg-white/10 text-sm" : "border-line bg-paper text-sm text-slate-700"}`}>
                        {machineTranslation ? (
                          <div data-machine-translation="true">
                            {manualTranslation ? <p className={`mb-1 text-[11px] font-semibold uppercase tracking-wide ${mine ? "text-white/75" : "text-slate-500"}`}>{uiLabel(uiLanguage, { zh: "机器翻译", en: "Machine translation", hi: "मशीन अनुवाद" })}</p> : null}
                            <p className="whitespace-pre-wrap break-words">{machineTranslation}</p>
                          </div>
                        ) : null}
                        {manualTranslation ? (
                          <div className={`mt-2 rounded border px-2 py-1.5 text-sm ${mine ? "border-white/35 bg-black/10" : "border-line bg-white/70 text-slate-700"}`} data-translation-editor-count={manualTranslationEditors.length}>
                            <div className="mb-1 flex flex-wrap items-baseline gap-y-0.5 text-[11px] font-semibold uppercase tracking-wide">
                              <span className={mine ? "text-white/75" : "text-slate-500"} data-translation-editor-heading>{uiLabel(uiLanguage, { zh: '人工修改', en: 'Edited translation', hi: 'संशोधित अनुवाद' })} ·&nbsp;</span>
                              {manualTranslationEditors.map((editor, editorIndex) => {
                              const tone = translationEditorTone(editor.editedById, mine);
                              return <span key={`${message.id}-translation-editor-${editor.editedById}`} className={tone.text} data-translation-editor-label={editor.editedById} data-translation-editor-tone={tone.text}>{editorIndex ? uiLabel(uiLanguage, { zh: '、', en: ', ', hi: '、' }) : ''}{editor.editedByName}</span>;
                            })}</div>
                            <p className='whitespace-pre-wrap break-words'>{manualTranslationParts.map((part, index) => {
                              const tone = part.editor ? translationEditorTone(part.editor.editedById, mine) : null;
                              return <span key={`${message.id}-translation-attribution-${index}`} className={tone?.highlight} data-translation-edited-part={part.editor?.editedById}>{part.text}</span>;
                            })}</p>
                          </div>
                        ) : null}
                        {messageTimeDisplayMode === "tail" && messageTime && !showOriginal ? <span className={`ml-2 inline whitespace-nowrap align-baseline text-[11px] ${mine ? "text-white/65" : "text-slate-400"}`} data-message-time-position="tail">{messageTime}{statusIndicator}{compactMessageActions}</span> : messageTimeDisplayMode === "hidden" && !showOriginal ? <>{statusIndicator}{compactMessageActions}</> : null}
                        {isEditingTranslation && translationEditDraft ? (
                          <div className='mt-2 space-y-2 rounded border border-brand/40 bg-white/90 p-2 text-ink'>
                            <textarea ref={translationEditTextareaRef} className='min-h-20 w-full resize-y rounded border border-line px-2 py-1.5 text-sm outline-none focus:border-brand' value={normalizeTranslationEditBody(translationEditDraft.body)} onChange={(event) => { const nextBody = event.currentTarget.value; translationEditBodyRef.current = nextBody; setTranslationEditDraft((current) => current ? { ...current, body: nextBody } : current); }} />
                            <div className='flex justify-end gap-2'>
                              <button className='rounded border border-line px-2 py-1 text-xs font-medium text-ink hover:border-brand' onClick={cancelTranslationEdit} type='button'>{uiLabel(uiLanguage, { zh: '取消', en: 'Cancel', hi: 'रद्द करें' })}</button>
                              <button className='rounded bg-brand px-2 py-1 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50' disabled={translationEditSaving || !normalizeTranslationEditBody(translationEditDraft.body).replace(/\u00a0/g, ' ').trim()} onClick={() => void saveTranslationEdit(message)} type='button'>{translationEditSaving ? '...' : uiLabel(uiLanguage, { zh: '保存修改', en: 'Save edit', hi: 'संशोधन सहेजें' })}</button>
                            </div>
                          </div>
                        ) : (
                          <button className={`mt-2 text-xs font-medium underline-offset-2 hover:underline ${mine ? 'text-white/80' : 'text-brand'}`} onClick={() => startTranslationEdit(message, manualTranslationTarget, manualTranslation?.body ?? translated ?? '')} type='button'>{manualTranslation ? uiLabel(uiLanguage, { zh: '修改人工翻译', en: 'Edit translation', hi: 'अनुवाद संपादित करें' }) : uiLabel(uiLanguage, { zh: '修改翻译', en: 'Edit translation', hi: 'अनुवाद संपादित करें' })}</button>
                        )}
                      </div>
                    ) : null}
                    {!message.revokedAt && translationError && !translated ? (
                      <div className={`mt-2 rounded border px-2 py-1.5 text-xs ${mine ? "border-white/25 bg-white/10 text-white/80" : "border-coral/30 bg-coral/10 text-coral"}`}>
                        <span>{messageActionLabels[uiLanguage].translationUnavailable}</span>
                        <button className={`ml-2 font-semibold underline-offset-2 hover:underline ${mine ? "text-white" : "text-coral"}`} disabled={isTranslationLoading} onClick={() => void refreshTranslation(message)} type="button">
                          {messageActionLabels[uiLanguage].retryTranslation}
                        </button>
                      </div>
                    ) : null}
                    {messageTimeDisplayMode === "tail" && messageTime && !isTextMessage && !hasMediaActionTail ? <span className={`ml-2 inline whitespace-nowrap align-baseline text-[11px] ${mine ? "text-white/65" : "text-slate-400"}`} data-message-time-position="tail">{messageTime}{statusIndicator}</span> : null}
                    {messageActionDisplayMode === "inline" || messageTimeDisplayMode === "bottom" || status === "failed" ? <div className={`mt-2 flex flex-wrap items-center justify-end gap-1.5 text-xs ${mine ? "text-white/70" : "text-slate-400"}`}>
                      {messageActionDisplayMode === "inline" ? <span className="inline-flex max-w-full flex-wrap items-center justify-end gap-1.5" data-message-actions="inline">
                      {!message.revokedAt && isTextMessage ? (
                        <button className={`grid h-6 w-6 place-items-center rounded ${mine ? "text-white/70 hover:bg-white/10 hover:text-white" : "text-slate-400 hover:bg-paper hover:text-ink"}`} disabled={isTranslationLoading} onClick={() => void refreshTranslation(message)} title={messageActionLabels[uiLanguage].translate} aria-label={messageActionLabels[uiLanguage].translate} type="button">
                          <RefreshCw className={isTranslationLoading ? "animate-spin" : undefined} size={13} />
                        </button>
                      ) : null}
                      {!message.revokedAt && isTextMessage ? (
                        <button className={`grid h-6 w-6 place-items-center rounded disabled:cursor-not-allowed disabled:opacity-35 ${speakingMessageKey === message.id + ":original" ? mine ? "bg-white/15 text-white" : "bg-paper text-ink" : mine ? "text-white/70 hover:bg-white/10 hover:text-white" : "text-slate-400 hover:bg-paper hover:text-ink"}`} disabled={!message.body?.trim()} onClick={() => void readOriginalMessage(message)} title={messageActionLabels[uiLanguage].readOriginal} aria-label={messageActionLabels[uiLanguage].readOriginal} type="button">
                          <Volume2 size={13} />
                        </button>
                      ) : null}
                      {!message.revokedAt && isTextMessage ? (
                        <button className={`grid h-6 w-6 place-items-center rounded disabled:cursor-not-allowed disabled:opacity-35 ${speakingMessageKey === message.id + ":translation:" + manualTranslationTarget ? mine ? "bg-white/15 text-white" : "bg-paper text-ink" : mine ? "text-white/70 hover:bg-white/10 hover:text-white" : "text-slate-400 hover:bg-paper hover:text-ink"}`} disabled={!translated} onClick={() => { if (translated) void readTranslatedMessage(message, translated, manualTranslationTarget); }} title={messageActionLabels[uiLanguage].readTranslation} aria-label={messageActionLabels[uiLanguage].readTranslation} type="button">
                          <AudioLines size={13} />
                        </button>
                      ) : null}
                      {!message.revokedAt ? (
                        <>
                          <button className="grid h-6 w-6 place-items-center rounded text-current opacity-80 hover:opacity-100" onClick={() => void toggleFavoriteMessage(message)} title={favoriteMessageIds.has(message.id) ? uiLabel(uiLanguage, { zh: "取消收藏", en: "Remove favorite", hi: "पसंदीदा हटाएं" }) : uiLabel(uiLanguage, { zh: "收藏", en: "Favorite", hi: "पसंदीदा" })} aria-label={favoriteMessageIds.has(message.id) ? uiLabel(uiLanguage, { zh: "取消收藏", en: "Remove favorite", hi: "पसंदीदा हटाएं" }) : uiLabel(uiLanguage, { zh: "收藏", en: "Favorite", hi: "पसंदीदा" })} type="button">
                            <Star fill={favoriteMessageIds.has(message.id) ? "currentColor" : "none"} size={13} />
                          </button>
                          {mine ? <button className={`grid h-6 w-6 place-items-center rounded disabled:cursor-not-allowed disabled:opacity-35 ${mine ? "text-white/70 hover:bg-white/10 hover:text-white" : "text-slate-400 hover:bg-paper hover:text-ink"}`} disabled={!canRevokeMessage(message)} onClick={() => void revokeMessage(message)} title={canRevokeMessage(message) ? t.revokeMessage : uiLabel(uiLanguage, { zh: "撤回（已超过可撤回时间）", en: "Recall (time limit expired)", hi: "वापस लें (समय सीमा समाप्त)" })} aria-label={t.revokeMessage} type="button">
                            <RotateCcw size={13} />
                          </button> : null}
                          {revokeBatch.length > 1 ? <button className={`grid h-6 w-6 place-items-center rounded ${mine ? "text-white/70 hover:bg-white/10 hover:text-white" : "text-slate-400 hover:bg-paper hover:text-ink"}`} onClick={() => void revokeMessageBatch(message)} title={messageActionLabels[uiLanguage].revokeBatch} aria-label={messageActionLabels[uiLanguage].revokeBatch} type="button">
                            <RefreshCw size={13} />
                          </button> : null}
                          <button className={`grid h-6 w-6 place-items-center rounded ${mine ? "text-white/70 hover:bg-white/10 hover:text-white" : "text-slate-400 hover:bg-paper hover:text-ink"}`} onClick={() => openForwardMessages([message])} title={uiLabel(uiLanguage, { zh: "转发", en: "Forward", hi: "फ़ॉरवर्ड" })} aria-label={uiLabel(uiLanguage, { zh: "转发", en: "Forward", hi: "फ़ॉरवर्ड" })} type="button">
                            <Send size={13} />
                          </button>
                          <button className={`grid h-6 w-6 place-items-center rounded ${mine ? "text-white/70 hover:bg-white/10 hover:text-white" : "text-slate-400 hover:bg-paper hover:text-ink"}`} onClick={() => startReply(message)} title={messageActionLabels[uiLanguage].reply} aria-label={messageActionLabels[uiLanguage].reply} type="button">
                            <Reply size={13} />
                          </button>
                          <button className={`grid h-6 w-6 place-items-center rounded ${mine ? "text-white/70 hover:bg-white/10 hover:text-white" : "text-slate-400 hover:bg-paper hover:text-ink"}`} onClick={() => setReminderForMessage(message)} title={messageActionLabels[uiLanguage].remind} aria-label={messageActionLabels[uiLanguage].remind} type="button">
                            <Bell size={13} />
                          </button>
                          {isTextMessage ? <button className={`grid h-6 w-6 place-items-center rounded disabled:cursor-not-allowed disabled:opacity-35 ${mine ? "text-white/70 hover:bg-white/10 hover:text-white" : "text-slate-400 hover:bg-paper hover:text-ink"}`} disabled={!message.body?.trim()} onClick={() => void copyMessageText(message)} title={messageActionLabels[uiLanguage].copyOriginal} aria-label={messageActionLabels[uiLanguage].copyOriginal} type="button">
                            <Copy size={13} />
                          </button> : null}
                          {isTextMessage ? <button className={`grid h-6 w-6 place-items-center rounded disabled:cursor-not-allowed disabled:opacity-35 ${mine ? "text-white/70 hover:bg-white/10 hover:text-white" : "text-slate-400 hover:bg-paper hover:text-ink"}`} disabled={!translated} onClick={() => { if (translated) void copyTranslatedMessageText(translated); }} title={messageActionLabels[uiLanguage].copyTranslation} aria-label={messageActionLabels[uiLanguage].copyTranslation} type="button">
                            <CopyCheck size={13} />
                          </button> : null}
                        </>
                      ) : null}
                      </span> : null}
                      {messageTimeDisplayMode === "bottom" && messageTime ? <span className="inline-flex items-center">{messageTime}{statusIndicator}{compactMessageActions}</span> : null}
                      {status === "failed" ? (
                        <button className="rounded border border-coral/40 bg-white/90 px-2 py-1 font-medium text-coral hover:border-coral" onClick={() => retryMessage(message)} type="button">
                          {messageActionLabels[uiLanguage].retry}
                        </button>
                      ) : null}
                    </div> : null}
                  </div>
                  {messageActionMenuId === message.id ? (
                    <div className="fixed inset-0 z-[10040] flex items-end justify-center bg-black/35 p-3 sm:items-center" onClick={() => setMessageActionMenuId(null)} role="presentation">
                      <div className="relative max-h-[78vh] w-fit max-w-[calc(100vw-1.5rem)] overflow-auto rounded-3xl bg-white p-3 pr-14 shadow-2xl" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={uiLabel(uiLanguage, { zh: "聊天信息功能键", en: "Message actions", hi: "संदेश क्रियाएं" })}>
                        <button className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-xl border border-line text-slate-500 hover:border-brand hover:text-ink" onClick={() => setMessageActionMenuId(null)} title={uiLabel(uiLanguage, { zh: "关闭", en: "Close", hi: "बंद करें" })} aria-label={uiLabel(uiLanguage, { zh: "关闭", en: "Close", hi: "बंद करें" })} type="button"><X size={17} /></button>
                        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                          {!message.revokedAt && isTextMessage ? <button className={messageActionIconMenuButtonClass} disabled={isTranslationLoading} onClick={() => { setMessageActionMenuId(null); void refreshTranslation(message); }} title={messageActionLabels[uiLanguage].translate} aria-label={messageActionLabels[uiLanguage].translate} type="button"><RefreshCw className={isTranslationLoading ? "animate-spin" : undefined} size={18} /></button> : null}
                          {!message.revokedAt && isTextMessage ? <button className={messageActionIconMenuButtonClass} disabled={!message.body?.trim()} onClick={() => { setMessageActionMenuId(null); void readOriginalMessage(message); }} title={messageActionLabels[uiLanguage].readOriginal} aria-label={messageActionLabels[uiLanguage].readOriginal} type="button"><Volume2 size={18} /></button> : null}
                          {!message.revokedAt && isTextMessage ? <button className={`${messageActionIconMenuButtonClass} text-brand`} disabled={!translated} onClick={() => { if (!translated) return; setMessageActionMenuId(null); void readTranslatedMessage(message, translated, manualTranslationTarget); }} title={messageActionLabels[uiLanguage].readTranslation} aria-label={messageActionLabels[uiLanguage].readTranslation} type="button"><AudioLines size={18} /></button> : null}
                          {canRevokeMessage(message) ? <button className={messageActionIconMenuButtonClass} onClick={() => { setMessageActionMenuId(null); void revokeMessage(message); }} title={t.revokeMessage} aria-label={t.revokeMessage} type="button"><RotateCcw size={18} /></button> : null}
                          {revokeBatch.length > 1 ? <button className={messageActionIconMenuButtonClass} onClick={() => { setMessageActionMenuId(null); void revokeMessageBatch(message); }} title={messageActionLabels[uiLanguage].revokeBatch} aria-label={messageActionLabels[uiLanguage].revokeBatch} type="button"><RefreshCw size={18} /></button> : null}
                          {!message.revokedAt ? <>
                            <button className={messageActionIconMenuButtonClass} onClick={() => { setMessageActionMenuId(null); openForwardMessages([message]); }} title={uiLabel(uiLanguage, { zh: "转发", en: "Forward", hi: "फ़ॉरवर्ड" })} aria-label={uiLabel(uiLanguage, { zh: "转发", en: "Forward", hi: "फ़ॉरवर्ड" })} type="button"><Send size={18} /></button>
                            <button className={messageActionIconMenuButtonClass} onClick={() => { setMessageActionMenuId(null); void toggleFavoriteMessage(message); }} title={favoriteMessageIds.has(message.id) ? uiLabel(uiLanguage, { zh: "取消收藏", en: "Remove favorite", hi: "पसंद हटाएं" }) : uiLabel(uiLanguage, { zh: "收藏", en: "Favorite", hi: "पसंदीदा" })} aria-label={favoriteMessageIds.has(message.id) ? uiLabel(uiLanguage, { zh: "取消收藏", en: "Remove favorite", hi: "पसंद हटाएं" }) : uiLabel(uiLanguage, { zh: "收藏", en: "Favorite", hi: "पसंदीदा" })} type="button"><Star fill={favoriteMessageIds.has(message.id) ? "currentColor" : "none"} size={18} /></button>
                            <button className={messageActionIconMenuButtonClass} onClick={() => { setMessageActionMenuId(null); setReminderForMessage(message); }} title={messageActionLabels[uiLanguage].remind} aria-label={messageActionLabels[uiLanguage].remind} type="button"><Bell size={18} /></button>
                            <button className={messageActionIconMenuButtonClass} onClick={() => { setMessageActionMenuId(null); startReply(message); }} title={messageActionLabels[uiLanguage].reply} aria-label={messageActionLabels[uiLanguage].reply} type="button"><Reply size={18} /></button>
                            {isTextMessage ? <>
                              <button className={messageActionIconMenuButtonClass} disabled={!message.body?.trim()} onClick={() => { setMessageActionMenuId(null); void copyMessageText(message); }} title={messageActionLabels[uiLanguage].copyOriginal} aria-label={messageActionLabels[uiLanguage].copyOriginal} type="button"><Copy size={18} /></button>
                              <button className={messageActionIconMenuButtonClass} disabled={!translated} onClick={() => { if (!translated) return; setMessageActionMenuId(null); void copyTranslatedMessageText(translated); }} title={messageActionLabels[uiLanguage].copyTranslation} aria-label={messageActionLabels[uiLanguage].copyTranslation} type="button"><CopyCheck size={18} /></button>
                            </> : null}
                          </> : null}
                          <button className={messageActionIconMenuButtonClass} onClick={() => { setMessageActionMenuId(null); beginMessageSelect(message.id); }} title={uiLabel(uiLanguage, { zh: "多选", en: "Select multiple", hi: "एकाधिक चुनें" })} aria-label={uiLabel(uiLanguage, { zh: "多选", en: "Select multiple", hi: "एकाधिक चुनें" })} type="button"><Check size={18} /></button>
                          <button className={`${messageActionIconMenuButtonClass} border-coral/30 text-coral hover:border-coral hover:bg-coral/5`} onClick={() => { setMessageActionMenuId(null); void deleteSingleMessage(message); }} title={uiLabel(uiLanguage, { zh: "删除（仅自己可见）", en: "Delete for me", hi: "मेरे लिए हटाएं" })} aria-label={uiLabel(uiLanguage, { zh: "删除（仅自己可见）", en: "Delete for me", hi: "मेरे लिए हटाएं" })} type="button"><Trash2 size={18} /></button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {mine ? <button type="button" className="shrink-0" onClick={() => currentUser ? openUserDetails(currentUser) : null} aria-label={t.viewContactDetails}><Avatar name={currentUser?.nickname ?? "Me"} url={senderAvatarUrl} size="sm" /></button> : null}
                </article>
              );
            })}
          </div>

          <form className="shrink-0 border-t border-white/70 bg-white/80 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl" onSubmit={sendMessage}>
            {pendingVoicePreview ? (
              <div className="mb-3 rounded-2xl border border-line bg-white/80 p-3 text-xs text-slate-600">
                <p className="mb-2 font-medium text-ink">{t.voicePreviewReady}</p>
                <audio className="w-full" src={pendingVoicePreview.url} controls />
                <div className="mt-3 flex justify-end gap-2">
                  <button className="rounded border border-line px-3 py-2 font-medium text-ink hover:border-brand" onClick={cancelPendingVoice} type="button">{t.voiceCancel}</button>
                  <button className="rounded-2xl bg-brand px-3 py-2 font-semibold text-white shadow-sm hover:bg-teal-800" onClick={() => void sendPendingVoice()} type="button">{t.voiceSendConfirm}</button>
                </div>
              </div>
            ) : null}
            {mediaUploading ? (
              <div className="mb-3 rounded-2xl border border-line bg-white/80 p-3 text-xs text-slate-600">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span>{t.uploadingMedia}</span>
                  <span className="font-medium text-ink">{mediaUploadProgress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded bg-slate-200">
                  <div className="h-full rounded bg-brand transition-[width]" style={{ width: `${mediaUploadProgress}%` }} />
                </div>
                <div className="mt-2 flex justify-end">
                  <button className="rounded border border-coral/40 px-3 py-1.5 font-medium text-coral hover:border-coral" onClick={cancelActiveMediaUpload} type="button">{uiLabel(uiLanguage, { zh: "取消上传", en: "Cancel upload", hi: "अपलोड रद्द करें" })}</button>
                </div>
              </div>
            ) : null}
            {pendingComposerFiles.length > 0 ? (
              <div className="mb-3 rounded-2xl border border-line bg-white/80 p-3 text-xs text-slate-600">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="font-medium text-ink">{uiLabel(uiLanguage, { zh: "待发送附件", en: "Pending attachments", hi: "लंबित अटैचमेंट" })} · {pendingComposerFiles.length}/99</span>
                  <div className="flex items-center gap-2">
                    <button className="rounded border border-brand/40 px-2 py-1 font-medium text-brand hover:border-brand disabled:cursor-not-allowed disabled:opacity-50" disabled={mediaUploading || pendingComposerFiles.length >= 99} onClick={() => mediaInputRef.current?.click()} type="button">{uiLabel(uiLanguage, { zh: "继续添加", en: "Add more", hi: "और जोड़ें" })}</button>
                    <button className="rounded border border-line px-2 py-1 font-medium text-ink hover:border-brand" onClick={() => { setPendingComposerFiles([]); setMediaSendVariant("preview"); }} type="button">{uiLabel(uiLanguage, { zh: "清空", en: "Clear", hi: "साफ करें" })}</button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {pendingComposerFiles.map((file, index) => (
                    <span key={`${file.name}-${index}`} className="inline-flex max-w-full items-center gap-2 rounded-2xl border border-line bg-white px-3 py-1.5">
                      <Paperclip size={13} />
                      <span className="max-w-[12rem] truncate">{file.name}</span>
                      <button className="text-slate-400 hover:text-coral" onClick={() => setPendingComposerFiles((items) => items.filter((_, fileIndex) => fileIndex !== index))} type="button">x</button>
                    </span>
                  ))}
                </div>
                {pendingVisualMediaCount > 0 ? (
                  <div className="mt-3 rounded-xl border border-brand/20 bg-brand/5 p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-ink">{uiLabel(uiLanguage, { zh: "图片和视频发送方式", en: "Image/video sending", hi: "चित्र/वीडियो भेजने का तरीका" })}</span>
                      <span className="text-[11px] text-slate-500">{pendingVisualMediaCount} {uiLabel(uiLanguage, { zh: "个媒体文件", en: "media item(s)", hi: "मीडिया आइटम" })}</span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button className={`rounded-xl border px-3 py-2 text-left transition ${mediaSendVariant === "preview" ? "border-brand bg-brand/10 text-ink ring-2 ring-brand/20" : "border-line bg-white text-slate-600 hover:border-brand"}`} onClick={() => setMediaSendVariant("preview")} type="button" aria-pressed={mediaSendVariant === "preview"}>
                        <span className="block font-semibold">{uiLabel(uiLanguage, { zh: "预览图（默认）", en: "Preview (default)", hi: "प्रीव्यू (डिफ़ॉल्ट)" })}</span>
                        <span className="mt-1 block text-[11px] leading-4 text-slate-500">{uiLabel(uiLanguage, { zh: "图片以清晰预览质量发送；视频会压缩后上传，仍可播放。", en: "Images use a clear preview quality; videos are compressed before upload and remain playable.", hi: "चित्र स्पष्ट प्रीव्यू गुणवत्ता में भेजे जाएंगे; वीडियो अपलोड से पहले संपीड़ित रहेगा और चल सकेगा।" })}</span>
                      </button>
                      <button className={`rounded-xl border px-3 py-2 text-left transition ${mediaSendVariant === "original" ? "border-brand bg-brand/10 text-ink ring-2 ring-brand/20" : "border-line bg-white text-slate-600 hover:border-brand"}`} onClick={() => setMediaSendVariant("original")} type="button" aria-pressed={mediaSendVariant === "original"}>
                        <span className="block font-semibold">{uiLabel(uiLanguage, { zh: "原图", en: "Original", hi: "मूल" })}</span>
                        <span className="mt-1 block text-[11px] leading-4 text-slate-500">{uiLabel(uiLanguage, { zh: "保留图片和视频原始文件。", en: "Keep the original image and video files.", hi: "मूल चित्र और वीडियो फाइलें रखें।" })}</span>
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            {replyingToMessage ? (
              <div className="mb-3 flex items-center gap-3 rounded-2xl border border-line bg-white/80 px-3 py-2 text-xs text-slate-600">
                <Reply size={14} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">{messageActionLabels[uiLanguage].reply}: {replyingToMessage.senderName ?? "Message"}</p>
                  <p className="truncate">{replyingToMessage.body || `[${replyingToMessage.type}]`}</p>
                </div>
                <button className="rounded border border-line px-2 py-1 font-medium text-ink hover:border-brand" type="button" onClick={() => setReplyingToMessage(null)}>x</button>
              </div>
            ) : null}
            <div className="relative">
              {composerMenuOpen ? (
                <div className="absolute bottom-full right-0 z-[2147483646] mb-2 grid w-52 gap-1 rounded-2xl border border-line bg-white p-2 text-sm shadow-xl">
                  <button className="flex items-center gap-2 rounded px-3 py-2 text-left text-ink hover:bg-paper disabled:opacity-50" disabled={!selectedExists || mediaUploading} onClick={() => { setComposerMenuOpen(false); mediaInputRef.current?.click(); }} type="button"><Paperclip size={17} />{t.attach}</button>
                  <button className="flex items-center gap-2 rounded px-3 py-2 text-left text-ink hover:bg-paper disabled:opacity-50" disabled={!selectedExists || mediaUploading} onClick={() => { setComposerMenuOpen(false); setLocationModalOpen(true); }} type="button"><MapPin size={17} />{uiLabel(uiLanguage, { zh: "发送位置", en: "Send location", hi: "स्थान भेजें" })}</button>
                  {selected.type === "group" ? <button className="flex items-center gap-2 rounded px-3 py-2 text-left text-ink hover:bg-paper disabled:opacity-50" disabled={!selectedExists || groupMembersLoading || groupMembersConversationId !== selected.id || mentionCandidates.length === 0} onClick={() => { setComposerMenuOpen(false); setStickerPanelOpen(false); setMentionPickerOpen(true); window.setTimeout(() => draftTextareaRef.current?.focus(), 0); }} type="button"><Users size={17} />{t.mentionUser}</button> : null}
                  <button className="flex items-center gap-2 rounded px-3 py-2 text-left text-ink hover:bg-paper" onClick={() => { setComposerMenuOpen(false); void openScreenshotEditor(); }} type="button"><Crop size={17} />{t.screenshotTool}</button>                  <button className="flex items-center gap-2 rounded px-3 py-2 text-left text-ink hover:bg-paper disabled:opacity-50" disabled={!selectedExists || Boolean(activeCall)} onClick={() => { setComposerMenuOpen(false); requestCall("audio"); }} type="button"><Phone size={17} />{callLabels[uiLanguage].audioCall}</button>
                  <button className="flex items-center gap-2 rounded px-3 py-2 text-left text-ink hover:bg-paper disabled:opacity-50" disabled={!selectedExists || Boolean(activeCall)} onClick={() => { setComposerMenuOpen(false); requestCall("video"); }} type="button"><Video size={17} />{callLabels[uiLanguage].videoCall}</button>
                  <button className="flex items-center gap-2 rounded px-3 py-2 text-left text-ink hover:bg-paper" onClick={() => { setComposerMenuOpen(false); setFavoritesSendMode(true); setFavoritesOpen(true); void loadFavorites(); }} type="button"><Star size={17} />{uiLabel(uiLanguage, { zh: "收藏", en: "Favorites", hi: "पसंदीदा" })}</button>
                  <button className="flex items-center gap-2 rounded px-3 py-2 text-left text-ink hover:bg-paper disabled:opacity-50" disabled={!selectedExists || mediaUploading} onClick={() => { setComposerMenuOpen(false); setStickerPanelOpen((open) => !open); }} type="button"><span className="text-lg leading-none">😀</span>{uiLabel(uiLanguage, { zh: "表情包", en: "Stickers", hi: "स्टिकर" })}</button>
                </div>
              ) : null}
              {mentionPickerOpen ? (
                <div className="absolute bottom-full left-14 z-[2147483646] mb-2 max-h-64 w-64 overflow-auto rounded-2xl border border-line bg-white p-2 text-sm shadow-xl">
                  {groupMembersLoading || groupMembersConversationId !== selected.id ? <p className="px-2 py-3 text-xs text-slate-500">{t.searching}</p> : mentionCandidates.map((member) => (
                    <button key={member.user.id} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left hover:bg-paper" onClick={() => insertMention(member.user)} type="button">
                      <Avatar name={displayUserName(member.user)} url={member.user.avatarUrl} size="sm" />
                      <span className="min-w-0 flex-1 truncate">{displayUserName(member.user)}</span>
                    </button>
                  ))}
                  {!groupMembersLoading && groupMembersConversationId === selected.id && mentionCandidates.length === 0 ? <p className="px-2 py-3 text-xs text-slate-500">{t.groupNoInviteCandidates}</p> : null}
                </div>
              ) : null}
              {stickerPanelOpen ? (
                <div className="absolute bottom-full right-0 z-[2147483646] mb-2 flex max-h-[min(34rem,calc(100dvh-7rem))] w-[min(24rem,calc(100vw-1rem))] flex-col rounded-3xl border border-line bg-white p-3 shadow-2xl" data-sticker-panel="open">
                  <div className="mb-2 flex min-h-8 items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                      <p className="shrink-0 text-sm font-semibold text-ink" data-sticker-panel-title={selectedStickerCategory}>{selectedStickerCategoryTitle}</p>
                      <button
                        aria-expanded={stickerSearchOpen}
                        aria-label={uiLabel(uiLanguage, { zh: "搜索表情包", en: "Search stickers", hi: "स्टिकर खोजें" })}
                        className={`grid h-7 w-7 shrink-0 place-items-center rounded-full transition ${stickerSearchOpen ? "bg-brand/10 text-brand" : "text-slate-500 hover:bg-paper hover:text-ink"}`}
                        data-sticker-search-trigger="true"
                        onClick={() => {
                          if (stickerSearchOpen) {
                            setStickerSearchOpen(false);
                            setStickerSearchQuery("");
                            return;
                          }
                          setStickerSearchOpen(true);
                          window.setTimeout(() => document.querySelector<HTMLInputElement>('[data-sticker-search="label"]')?.focus(), 0);
                        }}
                        title={uiLabel(uiLanguage, { zh: "搜索表情包", en: "Search stickers", hi: "स्टिकर खोजें" })}
                        type="button"
                      >
                        <Search size={15} />
                      </button>
                      {stickerSearchOpen ? (
                        <div className="relative min-w-0 flex-1">
                          <input
                            aria-label={uiLabel(uiLanguage, { zh: "按标签搜索表情包", en: "Search stickers by label", hi: "लेबल से स्टिकर खोजें" })}
                            className="h-8 w-full rounded-lg border border-line bg-paper/60 px-2.5 pr-7 text-xs text-ink outline-none transition focus:border-brand focus:bg-white focus:ring-2 focus:ring-brand/10"
                            data-sticker-search="label"
                            onChange={(event) => setStickerSearchQuery(event.target.value)}
                            placeholder={uiLabel(uiLanguage, { zh: "搜索标签", en: "Search labels", hi: "लेबल खोजें" })}
                            type="search"
                            value={stickerSearchQuery}
                          />
                          {stickerSearchQuery ? <button aria-label={uiLabel(uiLanguage, { zh: "清除搜索", en: "Clear search", hi: "खोज साफ़ करें" })} className="absolute right-0.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-slate-400 hover:bg-white hover:text-ink" onClick={() => setStickerSearchQuery("")} type="button"><X size={13} /></button> : null}
                        </div>
                      ) : null}
                    </div>
                    <button className="rounded-full px-2 py-1 text-xs text-slate-500 hover:bg-paper" onClick={() => setStickerPanelOpen(false)} type="button">{uiLabel(uiLanguage, { zh: "关闭", en: "Close", hi: "बंद करें" })}</button>
                  </div>
                  <div className="grid min-h-0 flex-1 grid-cols-4 gap-2 overflow-y-auto pr-1 sm:grid-cols-4" data-sticker-category-content={selectedStickerCategory}>
                    {visiblePanelStickers.map((sticker) => (
                      <button key={sticker.id} className={`relative ${sticker.imageUrl ? "min-h-20 rounded-xl bg-transparent p-0.5 text-center transition hover:bg-paper focus:outline-none focus:ring-2 focus:ring-brand/20" : `min-h-20 rounded-2xl border border-line bg-gradient-to-br ${sticker.tone} px-1.5 py-2 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20`}`} data-sticker-id={sticker.id} data-sticker-favorite={favoriteStickerIds.has(sticker.id) ? "true" : "false"} onClick={() => { if (stickerLongPressTriggeredRef.current) { stickerLongPressTriggeredRef.current = false; return; } sendSticker(sticker); }} onContextMenu={(event) => { event.preventDefault(); clearStickerLongPressTimer(); positionStickerActionMenu(sticker, event.clientX, event.clientY); }} onPointerDown={(event) => handleStickerPointerDown(event, sticker)} onPointerUp={clearStickerLongPressTimer} onPointerLeave={clearStickerLongPressTimer} onPointerCancel={clearStickerLongPressTimer} type="button" title={stickerLabel(sticker, uiLanguage)}>
                        {favoriteStickerIds.has(sticker.id) ? <span className="absolute right-1 top-1 z-10 grid h-5 w-5 place-items-center rounded-full bg-white/90 text-amber-500 shadow" aria-hidden="true"><Star fill="currentColor" size={12} /></span> : null}
                        {sticker.imageUrl
                          ? <img className="pointer-events-none mx-auto block h-auto w-full select-none" src={sticker.imageUrl} alt="" draggable={false} loading="lazy" />
                          : <span className="block text-3xl leading-none">{sticker.emoji}</span>}
                        <span className="mt-1 block truncate text-[11px] font-semibold text-ink" data-sticker-library-label={sticker.id}>{stickerLabel(sticker, uiLanguage)}</span>
                      </button>
                    ))}
                    {visiblePanelStickers.length === 0 ? <div className="col-span-4 grid min-h-36 place-items-center px-4 text-center text-sm text-slate-500" data-sticker-empty-state={normalizedStickerSearch ? "search" : selectedStickerCategory}>{normalizedStickerSearch ? uiLabel(uiLanguage, { zh: "没有找到匹配标签的表情包", en: "No stickers match that label", hi: "इस लेबल से कोई स्टिकर नहीं मिला" }) : uiLabel(uiLanguage, { zh: "还没有收藏表情包，右键或长按表情包即可收藏", en: "No favorites yet. Right-click or hold a sticker to add one.", hi: "अभी कोई पसंदीदा नहीं है। स्टिकर को राइट-क्लिक या देर तक दबाएँ।" })}</div> : null}
                  </div>
                  <div className="mt-2 flex shrink-0 items-center gap-1.5 overflow-x-auto border-t border-line pt-2" data-sticker-category-list="icon-buttons" data-sticker-category-position="bottom">
                    {STICKER_CATEGORIES.map((category, index) => (
                      <button
                        key={category.id}
                        aria-label={stickerCategoryLabel(category, uiLanguage)}
                        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border text-lg transition ${selectedStickerCategory === category.id ? "border-brand bg-brand/10 text-brand shadow-sm ring-1 ring-brand/20" : "border-line bg-white text-slate-600 hover:border-brand hover:bg-paper"}`}
                        data-sticker-category={category.id}
                        data-frequency-rank={index + 1}
                        onClick={() => { setSelectedStickerCategory(category.id); setStickerSearchOpen(false); setStickerSearchQuery(""); }}
                        title={stickerCategoryLabel(category, uiLanguage)}
                        type="button"
                      >
                        <span aria-hidden="true">{category.icon}</span>
                        <span className="sr-only">{stickerCategoryLabel(category, uiLanguage)}</span>
                      </button>
                    ))}
                  </div>
                </div>
) : null}
              {stickerActionMenu && typeof document !== "undefined" ? createPortal((
                <div className="fixed inset-0 z-[2147483647]" data-sticker-action-backdrop="true" onClick={(event) => { if (event.target !== event.currentTarget || Date.now() - stickerActionMenu.openedAt < 400) return; setStickerActionMenu(null); }} onContextMenu={(event) => { event.preventDefault(); setStickerActionMenu(null); }} role="presentation">
                  <div className="fixed min-w-36 rounded-xl border border-line bg-white p-1.5 shadow-2xl" data-sticker-action-menu={stickerActionMenu.sticker.id} onClick={(event) => event.stopPropagation()} style={{ left: stickerActionMenu.x, top: stickerActionMenu.y }}>
                    <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-ink hover:bg-paper" onClick={() => toggleStickerFavorite(stickerActionMenu.sticker)} type="button">
                      <Star className={favoriteStickerIds.has(stickerActionMenu.sticker.id) ? "text-amber-500" : "text-slate-500"} fill={favoriteStickerIds.has(stickerActionMenu.sticker.id) ? "currentColor" : "none"} size={16} />
                      {favoriteStickerIds.has(stickerActionMenu.sticker.id)
                        ? uiLabel(uiLanguage, { zh: "取消收藏", en: "Remove favorite", hi: "पसंदीदा हटाएँ" })
                        : uiLabel(uiLanguage, { zh: "收藏", en: "Add favorite", hi: "पसंदीदा बनाएँ" })}
                    </button>
                  </div>
                </div>
              ), document.body) : null}
              <div className="flex items-end gap-0.5 sm:gap-1" data-mobile-composer-row>
                <input ref={mediaInputRef} className="hidden" type="file" multiple onChange={handleMediaInputChange} />
                <button type="button" aria-label={composerInputMode === "keyboard" ? uiLabel(uiLanguage, { zh: "切换语音输入", en: "Switch to voice input", hi: "वॉइस इनपुट पर जाएं" }) : uiLabel(uiLanguage, { zh: "切换键盘输入", en: "Switch to keyboard input", hi: "कीबोर्ड इनपुट पर जाएं" })} title={composerInputMode === "keyboard" ? uiLabel(uiLanguage, { zh: "语音输入", en: "Voice input", hi: "वॉइस इनपुट" }) : uiLabel(uiLanguage, { zh: "键盘输入", en: "Keyboard input", hi: "कीबोर्ड इनपुट" })} className="grid h-11 w-9 shrink-0 place-items-center rounded-none border-0 bg-transparent p-0 text-ink shadow-none hover:text-brand disabled:opacity-50 sm:h-12 sm:w-10" data-composer-control="input-mode" disabled={!selectedExists || mediaUploading} onClick={() => { setComposerInputMode((mode) => mode === "keyboard" ? "voice" : "keyboard"); setComposerMenuOpen(false); }}>
                  {composerInputMode === "keyboard" ? <Mic size={22} /> : <KeyboardIcon size={22} />}
                </button>
                {composerInputMode === "voice" ? (
                  <>
                    <div className="relative h-11 min-w-0 flex-1 sm:h-12">
                      {voiceRecording ? (
                        <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 flex h-10 w-44 max-w-[calc(100vw-1rem)] -translate-x-1/2 items-center justify-center gap-0.5 rounded-2xl border border-coral/40 bg-white/95 px-3 shadow-xl backdrop-blur" aria-label={t.voiceRecording} role="status">
                          {voiceLevels.some((level) => level > 0.035) ? voiceLevels.map((level, index) => <span key={index} className="min-w-0 flex-1 rounded-full bg-coral transition-[height] duration-75" style={{ height: `${Math.max(2, 4 + level * 30)}px` }} />) : <span className="h-px w-full bg-coral/80" />}
                        </div>
                      ) : null}
                      <button type="button" aria-label={t.voiceRecordStart} title={t.voiceRecordStart} className={`relative grid h-11 w-full min-w-0 select-none touch-none place-items-center rounded-2xl border px-3 text-sm font-semibold transition-all disabled:opacity-50 sm:h-12 ${voiceRecording ? "scale-[1.01] border-coral bg-coral text-white ring-4 ring-coral/25" : "border-line bg-white text-ink hover:border-brand"}`} data-composer-input="voice" disabled={!selectedExists || mediaUploading} onPointerDown={handleVoiceButtonPointerDown} onPointerUp={handleVoiceButtonPointerUp} onPointerCancel={stopVoiceRecording}>
                        {voiceRecording ? <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 animate-pulse rounded-full bg-white" /> : null}
                        <Mic size={19} />{voiceRecording ? t.voiceRecording : uiLabel(uiLanguage, { zh: "按住说话", en: "Hold to talk", hi: "बोलने के लिए दबाएं" })}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="relative min-h-11 min-w-0 flex-1 self-end sm:min-h-12">
                    <textarea ref={draftTextareaRef} rows={1} className={`block box-border h-11 max-h-[15rem] min-h-11 w-full resize-none overflow-y-hidden self-end rounded-2xl border border-line bg-white px-3 py-1.5 leading-8 shadow-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10 disabled:bg-paper disabled:text-slate-400 sm:h-12 sm:min-h-12 sm:px-4 sm:py-2 ${speechToTextButtonVisible ? "pr-10 sm:pr-12" : "pr-3 sm:pr-4"}`} data-composer-input="true" disabled={!selectedExists} placeholder={`${t.input} (${sendShortcutLabel})`} value={draft} onPaste={handleComposerPaste} onKeyDown={handleComposerKeyDown} onKeyUp={() => syncMentionPicker()} onClick={() => syncMentionPicker()} onFocus={() => syncMentionPicker()} onSelect={() => syncMentionPicker()} onChange={handleDraftChange} />
                    {speechToTextButtonVisible ? <button type="button" aria-label={speechToTextLoading ? uiLabel(uiLanguage, { zh: "正在转换语音", en: "Converting speech", hi: "आवाज़ बदली जा रही है" }) : speechToTextListening ? uiLabel(uiLanguage, { zh: "停止语音转文字", en: "Stop speech-to-text", hi: "वॉइस-टू-टेक्स्ट रोकें" }) : uiLabel(uiLanguage, { zh: "语音转文字", en: "Speech to text", hi: "वॉइस-टू-टेक्स्ट" })} title={speechToTextLoading ? uiLabel(uiLanguage, { zh: "正在转换语音", en: "Converting speech", hi: "आवाज़ बदली जा रही है" }) : speechToTextListening ? uiLabel(uiLanguage, { zh: "停止语音转文字", en: "Stop speech-to-text", hi: "वॉइस-टू-टेक्स्ट रोकें" }) : uiLabel(uiLanguage, { zh: "语音转文字", en: "Speech to text", hi: "वॉइस-टू-टेक्स्ट" })} aria-pressed={speechToTextListening} className={`absolute right-1 top-1/2 z-10 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-xl border shadow-sm transition sm:h-10 sm:w-10 ${speechToTextListening ? "animate-pulse border-coral bg-coral/10 text-coral" : speechToTextLoading ? "animate-pulse border-brand bg-brand/10 text-brand" : "border-line bg-white/95 text-ink hover:border-brand"}`} disabled={!selectedExists || mediaUploading || speechToTextLoading} onClick={toggleSpeechToText}><AudioLines size={16} /></button> : null}
                  </div>
                )}
                 <button type="button" aria-label={uiLabel(uiLanguage, { zh: "表情", en: "Emoji", hi: "इमोजी" })} title={uiLabel(uiLanguage, { zh: "表情", en: "Emoji", hi: "इमोजी" })} className="grid h-11 w-9 min-h-11 shrink-0 place-items-center rounded-none border-0 bg-transparent p-0 text-ink shadow-none hover:text-brand disabled:opacity-50 sm:h-12 sm:w-10 sm:min-h-12" data-composer-control="emoji" disabled={!selectedExists || mediaUploading} onClick={() => { setComposerMenuOpen(false); setStickerPanelOpen((open) => !open); }}><Smile size={22} /></button>
                {draft.trim() || pendingComposerFiles.length > 0 ? (
                  <button type="submit" aria-label={uiLabel(uiLanguage, { zh: "发送消息", en: "Send message", hi: "संदेश भेजें" })} className="grid h-11 w-9 shrink-0 place-items-center rounded-2xl bg-brand text-white shadow-sm hover:bg-teal-800 disabled:opacity-50 sm:h-12 sm:w-11" data-composer-control="send" disabled={!selectedExists || mediaUploading}>
                    <Send size={17} />
                  </button>
                ) : (
                   <button type="button" aria-label={uiLabel(uiLanguage, { zh: "更多", en: "More", hi: "अधिक" })} title={uiLabel(uiLanguage, { zh: "更多", en: "More", hi: "अधिक" })} className="grid h-11 w-9 min-h-11 shrink-0 place-items-center rounded-none border-0 bg-transparent p-0 text-ink shadow-none hover:text-brand disabled:opacity-50 sm:h-12 sm:w-10 sm:min-h-12" data-composer-control="more" disabled={!selectedExists || mediaUploading} onClick={() => setComposerMenuOpen((open) => !open)}>
                     <Plus size={22} />
                  </button>
                )}
              </div>
            </div>
          </form>
          </>}
        </section>
        )}
        {locationModalOpen ? (
          <div className="fixed inset-0 z-[2147483645] grid place-items-center bg-slate-950/60 p-4" onClick={() => setLocationModalOpen(false)}>
            <div className="w-full max-w-md rounded-[24px] border border-white/80 bg-white/95 p-4 shadow-2xl backdrop-blur-xl" onClick={(event) => event.stopPropagation()}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="font-semibold text-ink">{uiLabel(uiLanguage, { zh: "发送位置", en: "Send location", hi: "स्थान भेजें" })}</p>
                <button className="rounded border border-line px-3 py-1.5 text-xs text-ink hover:border-brand" onClick={() => setLocationModalOpen(false)} type="button">{uiLabel(uiLanguage, { zh: "关闭", en: "Close", hi: "बंद करें" })}</button>
              </div>
              <div className="space-y-3">
                <button className="flex h-10 w-full items-center justify-center gap-2 rounded border border-line px-3 text-sm font-medium text-ink hover:border-brand disabled:opacity-60" disabled={locationLoading} onClick={useCurrentLocation} type="button">
                  <Navigation size={17} />{locationLoading ? uiLabel(uiLanguage, { zh: "定位中...", en: "Locating...", hi: "स्थान खोज रहे हैं..." }) : uiLabel(uiLanguage, { zh: "使用当前位置", en: "Use current location", hi: "वर्तमान स्थान उपयोग करें" })}
                </button>
                <label className="block text-sm font-medium text-ink">{uiLabel(uiLanguage, { zh: "位置名称", en: "Location name", hi: "स्थान का नाम" })}<input className="mt-1 h-10 w-full rounded border border-line px-3 text-sm outline-none focus:border-brand" maxLength={120} value={locationName} onChange={(event) => setLocationName(event.target.value)} placeholder={uiLabel(uiLanguage, { zh: "例如：客户工厂", en: "Example: Customer factory", hi: "उदाहरण: ग्राहक कारखाना" })} /></label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-ink">{uiLabel(uiLanguage, { zh: "纬度", en: "Latitude", hi: "अक्षांश" })}<input className="mt-1 h-10 w-full rounded border border-line px-3 text-sm outline-none focus:border-brand" inputMode="decimal" value={locationLatitude} onChange={(event) => setLocationLatitude(event.target.value)} placeholder="22.543096" /></label>
                  <label className="block text-sm font-medium text-ink">{uiLabel(uiLanguage, { zh: "经度", en: "Longitude", hi: "देशांतर" })}<input className="mt-1 h-10 w-full rounded border border-line px-3 text-sm outline-none focus:border-brand" inputMode="decimal" value={locationLongitude} onChange={(event) => setLocationLongitude(event.target.value)} placeholder="114.057865" /></label>
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button className="rounded border border-line px-3 py-2 text-sm font-medium text-ink hover:border-brand" onClick={() => { resetLocationDraft(); setLocationModalOpen(false); }} type="button">{uiLabel(uiLanguage, { zh: "取消", en: "Cancel", hi: "रद्द करें" })}</button>
                <button className="rounded bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60" disabled={!locationLatitude.trim() || !locationLongitude.trim()} onClick={sendLocationMessage} type="button">{uiLabel(uiLanguage, { zh: "发送", en: "Send", hi: "भेजें" })}</button>
              </div>
            </div>
          </div>
        ) : null}
        {avatarCropSource ? (
          <div className="fixed inset-0 z-[2147483645] grid place-items-center bg-slate-950/70 p-4">
            <div className="w-full max-w-sm rounded-[24px] border border-white/80 bg-white/95 p-4 shadow-2xl backdrop-blur-xl">
              <div className="mb-3 flex items-center justify-between">
                <p className="font-semibold text-ink">{t.cropAvatarTitle}</p>
                <button className="rounded border border-line px-3 py-1.5 text-xs text-ink" onClick={() => setAvatarCropSource("")} type="button">{t.cropAvatarCancel}</button>
              </div>
              <div
                ref={avatarCropFrameRef}
                className="relative mx-auto aspect-square w-full max-w-80 touch-none overflow-hidden rounded bg-slate-950 select-none"
                onPointerDown={handleAvatarCropPointerDown}
                onPointerMove={handleAvatarCropPointerMove}
                onPointerUp={handleAvatarCropPointerEnd}
                onPointerCancel={handleAvatarCropPointerEnd}
                onWheel={handleAvatarCropWheel}
              >
                <img
                  className="absolute left-1/2 top-1/2 max-w-none select-none"
                  draggable={false}
                  src={avatarCropSource}
                  alt={t.cropAvatarTitle}
                  onLoad={(event) => { setAvatarCropImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }); setAvatarCropFrameSize(avatarCropFrameRef.current?.clientWidth || 320); }}
                  style={{ transform: `translate(calc(-50% + ${avatarCropOffset.x}px), calc(-50% + ${avatarCropOffset.y}px)) scale(${avatarCropScale})`, width: `${avatarCropPreviewWidth}px`, height: `${avatarCropPreviewHeight}px` }}
                />
                <div className="pointer-events-none absolute inset-0 border-2 border-white/95 shadow-[0_0_0_999px_rgba(15,23,42,0.35)]" />
                <div className="pointer-events-none absolute inset-x-0 top-1/3 border-t border-white/35" />
                <div className="pointer-events-none absolute inset-x-0 top-2/3 border-t border-white/35" />
                <div className="pointer-events-none absolute inset-y-0 left-1/3 border-l border-white/35" />
                <div className="pointer-events-none absolute inset-y-0 left-2/3 border-l border-white/35" />
              </div>
              <button className="mt-4 h-10 w-full rounded bg-brand text-sm font-medium text-white" onClick={() => void confirmAvatarCrop()} type="button">{t.cropAvatarConfirm}</button>
            </div>
          </div>
        ) : null}
        {conversationMenu ? (
          <div className="fixed inset-0 z-[2147483646]" onClick={() => setConversationMenu(null)}>
            <div className="absolute w-44 rounded-2xl border border-line bg-white py-1 text-sm shadow-xl" style={{ left: conversationMenu.x, top: conversationMenu.y }} onClick={(event) => event.stopPropagation()}>
              <button className="block w-full px-4 py-2 text-left hover:bg-paper" onClick={() => toggleConversationPin(conversationMenu.conversationId)} type="button">
                {pinnedConversationIds.has(conversationMenu.conversationId) ? t.unpinConversation : t.pinConversation}
              </button>
              <button className="block w-full px-4 py-2 text-left text-coral hover:bg-paper" onClick={() => deleteConversationFromList(conversationMenu.conversationId)} type="button">
                {t.deleteChat}
              </button>
            </div>
          </div>
        ) : null}        {forwardMessages.length > 0 ? (
          <div className="fixed inset-0 z-[2147483645] bg-slate-950/45 p-4" onClick={() => { setForwardMessages([]); setForwardQuery(""); }}>
            <div className="mx-auto mt-16 max-h-[72vh] w-full max-w-md overflow-hidden rounded bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{uiLabel(uiLanguage, { zh: "转发消息", en: "Forward message", hi: "संदेश फ़ॉरवर्ड करें" })}</p>
                  <p className="text-xs text-slate-500">{forwardMessages.length} {uiLabel(uiLanguage, { zh: "条消息", en: "messages", hi: "संदेश" })}</p>
                </div>
                <button className="rounded border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-brand" onClick={() => { setForwardMessages([]); setForwardQuery(""); }} type="button">{t.adminClose}</button>
              </div>
              <div className="border-b border-line px-3 py-2">
                <label className="flex h-10 items-center gap-2 rounded-2xl border border-line bg-white px-3 text-sm text-slate-500">
                  <Search size={16} />
                  <input autoFocus className="min-w-0 flex-1 bg-transparent text-ink outline-none" placeholder={uiLabel(uiLanguage, { zh: "搜索用户名、备注名或群聊", en: "Search username, remark, or group", hi: "उपयोगकर्ता नाम, रिमार्क या समूह खोजें" })} value={forwardQuery} onChange={(event) => setForwardQuery(event.target.value)} />
                  {forwardQuery ? <button className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-paper hover:text-ink" onClick={() => setForwardQuery("")} type="button" aria-label={uiLabel(uiLanguage, { zh: "清空搜索", en: "Clear search", hi: "खोज साफ करें" })}>×</button> : null}
                </label>
              </div>
              <div className="max-h-[56vh] overflow-auto p-2">
                {filteredForwardConversations.length === 0 ? <p className="rounded-2xl border border-line bg-white/80 p-4 text-sm text-slate-500">{t.noConversations}</p> : null}
                {filteredForwardConversations.map((conversation) => (
                  <button key={conversation.id} className="flex w-full items-center gap-3 rounded px-3 py-2 text-left hover:bg-paper" onClick={() => forwardMessageToConversation(conversation)} type="button">
                    <Avatar name={displayConversationName(conversation)} url={conversation.avatarUrl} kind={conversation.type === "group" ? "group" : "user"} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{displayConversationName(conversation)}</span>
                      <span className="block truncate text-xs text-slate-500">{conversation.preview}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {favoritesOpen ? (
          <div className="fixed inset-0 z-[2147483645] bg-slate-950/45 p-4" onClick={() => setFavoritesOpen(false)}>
            <div className="mx-auto mt-10 flex max-h-[82vh] w-full max-w-2xl flex-col rounded bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <div>
                  <p className="font-semibold text-ink">{uiLabel(uiLanguage, { zh: "收藏", en: "Favorites", hi: "पसंदीदा" })}</p>
                  <p className="text-xs text-slate-500">{favoritesSendMode ? uiLabel(uiLanguage, { zh: "点击收藏内容直接发送；定位按钮只负责定位原消息", en: "Click a favorite to send it; the locate button only opens the original message", hi: "पसंदीदा सामग्री को सीधे भेजने के लिए उस पर क्लिक करें; स्थान बटन केवल मूल संदेश खोलता है" }) : uiLabel(uiLanguage, { zh: "点击收藏内容查看原内容；定位按钮只负责定位原消息", en: "Click a favorite to open it; the locate button only opens the original message", hi: "पसंदीदा सामग्री देखने के लिए उस पर क्लिक करें; स्थान बटन केवल मूल संदेश खोलता है" })}</p>
                </div>
                <button className="rounded border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-brand" onClick={() => setFavoritesOpen(false)} type="button">{t.adminClose}</button>
              </div>
              <div className="border-b border-line px-4 py-3">
                <label className="flex h-10 items-center gap-2 rounded-2xl border border-line bg-white/80 px-3 text-sm text-slate-500">
                  <Search size={16} />
                  <input className="min-w-0 flex-1 bg-transparent text-ink outline-none" placeholder={uiLabel(uiLanguage, { zh: "搜索收藏内容或标签", en: "Search favorites or tags", hi: "पसंदीदा या टैग खोजें" })} value={favoriteSearchQuery} onChange={(event) => setFavoriteSearchQuery(event.target.value)} />{favoriteSearchQuery ? <button className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-paper hover:text-ink" onClick={() => setFavoriteSearchQuery("")} type="button" aria-label={uiLabel(uiLanguage, { zh: "清空搜索", en: "Clear search", hi: "खोज साफ करें" })}>×</button> : null}
                </label>
              </div>
              <div className="min-h-0 flex-1 overflow-auto p-4">
                {favoritesLoading ? <p className="rounded-2xl border border-line bg-white/80 p-4 text-sm text-slate-500">{t.loadingMessages}</p> : null}
                {!favoritesLoading && favoriteMessages.length === 0 ? <p className="rounded-2xl border border-line bg-white/80 p-4 text-sm text-slate-500">{uiLabel(uiLanguage, { zh: "暂无收藏消息", en: "No favorite messages yet.", hi: "अभी कोई पसंदीदा संदेश नहीं है।" })}</p> : null}
                {!favoritesLoading && favoriteMessages.length > 0 && filteredFavoriteMessages.length === 0 ? <p className="rounded-2xl border border-line bg-white/80 p-4 text-sm text-slate-500">{uiLabel(uiLanguage, { zh: "没有匹配的收藏", en: "No matching favorites.", hi: "कोई मेल खाता पसंदीदा नहीं मिला।" })}</p> : null}
                <div className="space-y-2">
                  {filteredFavoriteMessages.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-line bg-white p-3 hover:border-brand">
                      <button className="block w-full text-left" onClick={(event) => handleFavoriteClick(event, item)} onContextMenu={(event) => { event.preventDefault(); clearFavoriteLongPressTimer(); setFavoriteActionItem(item); }} onPointerDown={(event) => handleFavoritePointerDown(event, item)} onPointerMove={handleFavoritePointerMove} onPointerUp={clearFavoriteLongPressTimer} onPointerLeave={clearFavoriteLongPressTimer} onPointerCancel={clearFavoriteLongPressTimer} type="button" aria-label={favoritesSendMode ? uiLabel(uiLanguage, { zh: "发送收藏内容", en: "Send favorite content", hi: "पसंदीदा सामग्री भेजें" }) : uiLabel(uiLanguage, { zh: "打开收藏内容", en: "Open favorite content", hi: "पसंदीदा सामग्री खोलें" })}>
                        <p className="truncate text-xs text-slate-500">{item.conversation?.title ?? uiLabel(uiLanguage, { zh: "聊天", en: "Chat", hi: "चैट" })} · {item.message.senderName ?? item.message.senderId} · {formatMessageTime(item.message.createdAt)}</p>
                        <p className="mt-1 line-clamp-2 text-sm text-ink">{mediaPreviewLabel(item.message)}</p>
                        {(item.tags ?? []).length > 0 ? <p className="mt-2 flex flex-wrap gap-1">{(item.tags ?? []).map((tag) => <span key={tag} className="rounded bg-paper px-1.5 py-0.5 text-xs text-brand">#{tag}</span>)}</p> : null}
                      </button>
                      <div className="mt-3 flex items-center gap-3 text-xs">
                        <button className="inline-flex items-center gap-1 text-brand underline-offset-2 hover:underline" onClick={() => jumpToFavoriteMessage(item)} type="button"><Search size={13} />{t.mediaLocate}</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}
        {favoriteActionItem ? (
          <div className="fixed inset-0 z-[2147483647] grid place-items-center bg-slate-950/55 p-4" onClick={() => setFavoriteActionItem(null)} role="presentation">
            <div className="w-full max-w-sm rounded-3xl bg-white p-4 shadow-2xl" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={uiLabel(uiLanguage, { zh: "收藏功能菜单", en: "Favorite actions", hi: "पसंदीदा क्रियाएं" })}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="min-w-0 truncate font-semibold text-ink">{favoriteActionItem.message.body || mediaPreviewLabel(favoriteActionItem.message)}</p>
                <button className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-line text-slate-500 hover:border-brand" onClick={() => setFavoriteActionItem(null)} title={uiLabel(uiLanguage, { zh: "关闭", en: "Close", hi: "बंद करें" })} aria-label={uiLabel(uiLanguage, { zh: "关闭", en: "Close", hi: "बंद करें" })} type="button"><X size={17} /></button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button className={detailSecondaryButtonClass} onClick={() => { const item = favoriteActionItem; setFavoriteActionItem(null); void copyMessageText(item.message); }} type="button"><Copy size={17} />{messageActionLabels[uiLanguage].copy}</button>
                <button className={detailSecondaryButtonClass} onClick={() => forwardFavoriteItem(favoriteActionItem)} type="button"><Send size={17} />{uiLabel(uiLanguage, { zh: "转发", en: "Forward", hi: "फ़ॉरवर्ड" })}</button>
                {(favoriteActionItem.message.body?.trim() || favoriteActionItem.message.transcript?.trim()) ? <button className={detailSecondaryButtonClass} onClick={() => { const item = favoriteActionItem; setFavoriteActionItem(null); void readOriginalMessage(item.message); }} type="button"><Volume2 size={17} />{messageActionLabels[uiLanguage].readOriginal}</button> : null}
                {favoriteTranslation(favoriteActionItem).body ? <button className={`${detailSecondaryButtonClass} text-brand`} onClick={() => { const item = favoriteActionItem; const translation = favoriteTranslation(item); setFavoriteActionItem(null); void readTranslatedMessage(item.message, translation.body!, translation.target); }} type="button"><AudioLines size={17} />{messageActionLabels[uiLanguage].readTranslation}</button> : null}
                <button className={`${detailSecondaryButtonClass} border-coral/30 text-coral hover:border-coral hover:bg-coral/5`} onClick={() => void removeFavoriteItem(favoriteActionItem)} type="button"><Trash2 size={17} />{uiLabel(uiLanguage, { zh: "删除收藏", en: "Delete favorite", hi: "पसंदीदा हटाएं" })}</button>
              </div>
            </div>
          </div>
        ) : null}
        {favoritePreviewItem ? (
          <div className="fixed inset-0 z-[2147483646] grid place-items-center bg-slate-950/55 p-4" onClick={() => setFavoritePreviewItem(null)}>
            <div className="flex max-h-[82vh] w-full max-w-xl flex-col rounded-3xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{uiLabel(uiLanguage, { zh: "收藏内容", en: "Favorite content", hi: "पसंदीदा सामग्री" })}</p>
                  <p className="truncate text-xs text-slate-500">{favoritePreviewItem.conversation?.title ?? uiLabel(uiLanguage, { zh: "聊天", en: "Chat", hi: "चैट" })} · {favoritePreviewItem.message.senderName ?? favoritePreviewItem.message.senderId} · {formatMessageTime(favoritePreviewItem.message.createdAt)}</p>
                </div>
                <button className="rounded border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-brand" onClick={() => setFavoritePreviewItem(null)} type="button">{t.adminClose}</button>
              </div>
              <div className="min-h-0 flex-1 overflow-auto space-y-3 p-4">
                <div className="rounded-2xl border border-line bg-paper/60 p-4">
                  <p className="whitespace-pre-wrap break-words text-sm text-ink">{favoritePreviewItem.message.body || mediaPreviewLabel(favoritePreviewItem.message) || uiLabel(uiLanguage, { zh: "无文字内容", en: "No text content", hi: "कोई टेक्स्ट सामग्री नहीं" })}</p>
                </div>
                {favoritePreviewItem.message.transcript ? <div className="rounded-2xl border border-line bg-white p-3"><p className="text-xs font-medium text-slate-500">{uiLabel(uiLanguage, { zh: "语音转文字", en: "Transcript", hi: "लिखित पाठ" })}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink">{favoritePreviewItem.message.transcript}</p></div> : null}
                {favoritePreviewItem.message.translations?.[translationTargetLanguage] ? <div className="rounded-2xl border border-line bg-white p-3"><p className="text-xs font-medium text-slate-500">{uiLabel(uiLanguage, { zh: "机器翻译", en: "Machine translation", hi: "मशीन अनुवाद" })}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink">{favoritePreviewItem.message.translations[translationTargetLanguage]}</p></div> : null}
                {favoritePreviewItem.message.manualTranslations?.[translationTargetLanguage]?.body ? (() => {
                  const manual = favoritePreviewItem.message.manualTranslations?.[translationTargetLanguage];
                  if (!manual) return null;
                  const original = manual.originalBody ?? favoritePreviewItem.message.translations?.[translationTargetLanguage] ?? "";
                  const parts = translationAttributionParts(original, manual);
                  const editors = Array.from(new Map(manualTranslationRevisions(manual).map((revision) => [revision.editedById, revision] as const)).values());
                  return <div className="rounded-2xl border border-line bg-white/70 p-3" data-translation-editor-count={editors.length}>
                    <div className="flex flex-wrap items-baseline gap-y-0.5 text-xs font-medium">
                      <span className="text-slate-500" data-translation-editor-heading>{uiLabel(uiLanguage, { zh: "人工修改", en: "Edited translation", hi: "संशोधित अनुवाद" })} ·&nbsp;</span>
                      {editors.map((editor, editorIndex) => { const tone = translationEditorTone(editor.editedById); return <span key={`favorite-editor-${editor.editedById}`} className={tone.text} data-translation-editor-label={editor.editedById}>{editorIndex ? uiLabel(uiLanguage, { zh: '、', en: ', ', hi: '、' }) : ''}{editor.editedByName}</span>; })}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink">{parts.map((part, index) => { const tone = part.editor ? translationEditorTone(part.editor.editedById) : null; return <span key={`favorite-translation-part-${index}`} className={tone?.highlight} data-translation-edited-part={part.editor?.editedById}>{part.text}</span>; })}</p>
                  </div>;
                })() : null}
                {(favoritePreviewItem.tags ?? []).length > 0 ? <div className="flex flex-wrap gap-1">{(favoritePreviewItem.tags ?? []).map((tag) => <span key={tag} className="rounded bg-paper px-2 py-1 text-xs text-brand">#{tag}</span>)}</div> : null}
              </div>
              <div className="flex flex-wrap justify-end gap-2 border-t border-line px-4 py-3">
                <button className="inline-flex items-center gap-1 rounded-2xl border border-line px-3 py-2 text-sm font-medium text-ink hover:border-brand" onClick={() => jumpToFavoriteMessage(favoritePreviewItem)} type="button"><Search size={14} />{t.mediaLocate}</button>
                <button className="rounded-2xl bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800" onClick={() => setFavoritePreviewItem(null)} type="button">{t.adminClose}</button>
              </div>
            </div>
          </div>
        ) : null}
        {mediaLibraryOpen ? (
          <div className="fixed inset-0 z-[2147483645] bg-slate-950/45 p-4" onClick={() => closeMediaLibrary(true)}>
            <div className="mx-auto mt-10 flex max-h-[82vh] w-full max-w-3xl flex-col rounded bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <div>
                  <p className="font-semibold text-ink">{mediaLibraryView === "history" ? uiLabel(uiLanguage, { zh: "\u67e5\u627e\u804a\u5929\u8bb0\u5f55", en: "Search chat history", hi: "चैट इतिहास खोजें" }) : t.mediaFiles}</p>
                  {mediaLibraryReturnDetails ? <p className="text-xs text-slate-500">{uiLabel(uiLanguage, { zh: "\u5173\u95ed\u540e\u8fd4\u56de\u8be6\u60c5\u9875", en: "Close to return to details", hi: "विवरण पर लौटने के लिए बंद करें" })}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  {mediaLibraryReturnDetails ? <button className="rounded border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-brand" onClick={() => closeMediaLibrary(true)} type="button">{uiLabel(uiLanguage, { zh: "\u8fd4\u56de\u8be6\u60c5", en: "Back to details", hi: "विवरण पर वापस" })}</button> : null}
                  <button className="rounded border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-brand" onClick={() => closeMediaLibrary(true)} type="button">{t.adminClose}</button>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
                <div className="flex gap-2">
                  <button className={`rounded border px-3 py-1.5 text-xs font-medium ${mediaLibraryView === "history" ? "border-brand bg-brand text-white" : "border-line text-ink hover:border-brand"}`} onClick={() => setMediaLibraryView("history")} type="button">{uiLabel(uiLanguage, { zh: "历史记录", en: "History", hi: "इतिहास" })}</button>
                  <button className={`rounded border px-3 py-1.5 text-xs font-medium ${mediaLibraryView === "files" ? "border-brand bg-brand text-white" : "border-line text-ink hover:border-brand"}`} onClick={() => setMediaLibraryView("files")} type="button">{uiLabel(uiLanguage, { zh: "文件", en: "Files", hi: "फ़ाइलें" })}</button>
                </div>
                <div className="flex rounded-2xl border border-line bg-paper p-1 text-xs font-medium">
                  <button className={`rounded-xl px-3 py-1 ${mediaLibraryScope === "current" ? "bg-white text-ink shadow-sm" : "text-slate-500 hover:text-ink"}`} onClick={() => setMediaLibraryScope("current")} type="button">{uiLabel(uiLanguage, { zh: "当前会话", en: "Current", hi: "वर्तमान" })}</button>
                  <button className={`rounded-xl px-3 py-1 ${mediaLibraryScope === "all" ? "bg-white text-ink shadow-sm" : "text-slate-500 hover:text-ink"}`} onClick={() => setMediaLibraryScope("all")} type="button">{uiLabel(uiLanguage, { zh: "全部聊天", en: "All chats", hi: "सभी चैट" })}</button>
                </div>
              </div>
              {mediaLibraryView === "history" ? (
                <div className="min-h-0 flex-1 overflow-auto p-4">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <div className="relative min-w-48 flex-1">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                      <input className="h-9 w-full rounded-2xl border border-line bg-white pl-8 pr-9 text-sm outline-none focus:border-brand" placeholder={uiLabel(uiLanguage, { zh: "搜索聊天记录", en: "Search chat history", hi: "चैट इतिहास खोजें" })} value={messageSearchQuery} onChange={(event) => setMessageSearchQuery(event.target.value)} />{messageSearchQuery ? <button className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-slate-400 hover:bg-paper hover:text-ink" onClick={() => setMessageSearchQuery("")} type="button" aria-label={uiLabel(uiLanguage, { zh: "清空搜索", en: "Clear search", hi: "खोज साफ करें" })}>×</button> : null}
                    </div>
                    <select className="h-9 rounded-2xl border border-line bg-white px-2 text-sm outline-none focus:border-brand" value={messageSearchType} onChange={(event) => setMessageSearchType(event.target.value as MessageSearchType)}>
                      {messageSearchTypes.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                    </select>
                    <input className="h-9 rounded-2xl border border-line bg-white px-2 text-sm outline-none focus:border-brand" type="date" value={messageSearchDate} onChange={(event) => setMessageSearchDate(event.target.value)} />
                    {messageSearchActive ? <button className="h-9 rounded border border-line px-3 text-sm font-medium text-ink hover:border-brand" type="button" onClick={() => { setMessageSearchQuery(""); setMessageSearchType("all"); setMessageSearchDate(""); }}>{uiLabel(uiLanguage, { zh: "清空", en: "Clear", hi: "साफ करें" })}</button> : null}
                  </div>
                  {!messageSearchActive ? <p className="rounded-2xl border border-line bg-white/80 p-4 text-sm text-slate-500">{uiLabel(uiLanguage, { zh: "输入关键词、日期或类型搜索当前范围内的聊天记录。", en: "Enter a keyword, date, or type to search chat history in the selected scope.", hi: "चुने गए दायरे के चैट इतिहास में खोजने के लिए कीवर्ड, तारीख या प्रकार दर्ज करें।" })}</p> : null}
                  {messageSearchActive && messageSearchResults.length === 0 ? <p className="rounded-2xl border border-line bg-white/80 p-4 text-sm text-slate-500">{uiLabel(uiLanguage, { zh: "当前范围内没有匹配结果", en: "No matches in the selected scope", hi: "चुने गए दायरे में कोई परिणाम नहीं मिला" })}</p> : null}
                  <div className="space-y-2">
                    {messageSearchResults.map((message) => (
                      <button key={message.id} className="w-full rounded-2xl border border-line bg-white px-3 py-2 text-left text-sm hover:border-brand hover:bg-paper" type="button" onClick={() => locateMediaMessage(message.id, message.conversationId)}>
                        <span className="block truncate font-medium text-ink">{message.senderName ?? message.type} · {formatMessageTime(message.createdAt) || message.createdAt.slice(0, 10)}</span>
                        <span className="mt-1 block truncate text-slate-500">{mediaPreviewLabel(message) || message.transcript || `[${message.type}]`}</span>
                      </button>
                    ))}
                  </div>
                  {historyCursors[selected.id] ? <button className="mt-4 w-full rounded border border-line px-3 py-2 text-sm font-medium text-ink hover:border-brand disabled:opacity-50" disabled={historyLoading} onClick={loadOlderMessages} type="button">{historyLoading ? t.loadingOlder : t.mediaLoadOlder}</button> : null}
                </div>
              ) : (
                <>
                  <div className="flex min-h-14 items-center gap-2 overflow-x-auto border-b border-line px-4 py-2">
                    {mediaLibraryFilters.map((item) => (
                      <button key={item.key} className={`shrink-0 whitespace-nowrap rounded border px-3 py-2 text-sm font-medium leading-5 ${mediaLibraryFilter === item.key ? "border-brand bg-brand text-white" : "border-line text-ink hover:border-brand"}`} onClick={() => setMediaLibraryFilter(item.key)} type="button">
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
                    <label className="inline-flex items-center gap-2 text-sm text-ink">
                      <input checked={sortedMediaLibraryMessages.filter((message) => message.senderId === currentUser?.id).length > 0 && sortedMediaLibraryMessages.filter((message) => message.senderId === currentUser?.id).every((message) => selectedManagedFileIds.has(message.id))} onChange={(event) => setSelectedManagedFileIds(event.target.checked ? new Set(sortedMediaLibraryMessages.filter((message) => message.senderId === currentUser?.id).map((message) => message.id)) : new Set())} type="checkbox" />
                      {uiLabel(uiLanguage, { zh: "全选可删除文件", en: "Select deletable files", hi: "हटाने योग्य फ़ाइलें चुनें" })}
                    </label>
                    <select className="h-9 rounded-2xl border border-line bg-white px-3 text-sm outline-none focus:border-brand" value={mediaLibrarySort} onChange={(event) => setMediaLibrarySort(event.target.value as typeof mediaLibrarySort)}>
                      <option value="name-asc">{uiLabel(uiLanguage, { zh: "名称 A→Z", en: "Name A→Z", hi: "नाम A→Z" })}</option>
                      <option value="name-desc">{uiLabel(uiLanguage, { zh: "名称 Z→A", en: "Name Z→A", hi: "नाम Z→A" })}</option>
                      <option value="size-asc">{uiLabel(uiLanguage, { zh: "文件从小到大", en: "Size small→large", hi: "आकार छोटा→बड़ा" })}</option>
                      <option value="size-desc">{uiLabel(uiLanguage, { zh: "文件从大到小", en: "Size large→small", hi: "आकार बड़ा→छोटा" })}</option>
                    </select>
                    <button className="ml-auto h-9 rounded-2xl bg-coral px-3 text-sm font-semibold text-white disabled:opacity-40" disabled={managedFileDeleting || selectedManagedFileIds.size === 0} onClick={() => void deleteSelectedManagedFiles()} type="button"><Trash2 className="mr-1 inline" size={14} />{managedFileDeleting ? "..." : uiLabel(uiLanguage, { zh: `删除 (${selectedManagedFileIds.size})`, en: `Delete (${selectedManagedFileIds.size})`, hi: `हटाएं (${selectedManagedFileIds.size})` })}</button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-auto p-4">
                    {filteredMediaLibraryMessages.length === 0 ? <p className="rounded-2xl border border-line bg-white/80 p-4 text-sm text-slate-500">{t.mediaEmpty}</p> : null}
                    <div className="grid gap-3 sm:grid-cols-2">
                      {sortedMediaLibraryMessages.map((message) => (
                        <div key={message.id} className={`rounded-2xl border bg-white p-3 text-sm shadow-sm ${selectedManagedFileIds.has(message.id) ? "border-brand ring-2 ring-brand/10" : "border-line"}`}>
                          <label className="mb-2 flex items-center gap-2 text-xs text-slate-500">
                            <input checked={selectedManagedFileIds.has(message.id)} disabled={message.senderId !== currentUser?.id} onChange={(event) => setSelectedManagedFileIds((current) => { const next = new Set(current); if (event.target.checked) next.add(message.id); else next.delete(message.id); return next; })} type="checkbox" />
                            {message.senderId === currentUser?.id ? uiLabel(uiLanguage, { zh: "选择", en: "Select", hi: "चुनें" }) : uiLabel(uiLanguage, { zh: "仅发送者可删除", en: "Only sender can delete", hi: "केवल भेजने वाला हटा सकता है" })}
                          </label>
                          <button className="flex w-full items-center gap-3 text-left" onClick={() => message.type === "image" || message.type === "video" || message.type === "audio" ? setPreviewMedia({ url: mediaPreviewUrl(message), type: message.type, name: message.body }) : isPreviewableDocument(message) ? void openDocumentPreview(message) : window.open(mediaPreviewUrl(message), "_blank", "noopener,noreferrer")} type="button">
                            {message.type === "image" ? <img className="h-14 w-14 rounded object-cover" src={mediaThumbnailUrl(message)} alt={message.body ?? "Image"} /> : null}
                            {message.type === "video" ? <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded bg-slate-900 text-white"><video className="h-full w-full object-cover" src={mediaPreviewUrl(message)} poster={videoThumbnailUrl(message)} preload="metadata" muted playsInline /><span className="absolute inset-0 grid place-items-center bg-black/20"><Play size={18} fill="currentColor" /></span></span> : null}
                            {message.type === "audio" ? <span className="grid h-14 w-14 place-items-center rounded bg-paper text-ink"><Music2 size={20} /></span> : null}
                            {message.type === "file" ? <span className="grid h-14 w-14 place-items-center rounded bg-paper text-ink"><FileText size={20} /></span> : null}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium text-ink">{message.body ?? mediaPreviewLabel(message)}</span>
                              <span className="mt-1 block text-xs text-slate-500">{formatFileSize(message.mediaSizeBytes)} · {formatMessageTime(message.createdAt)}</span>
                            </span>
                          </button>
                          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs"><button className="inline-flex items-center gap-1 text-brand underline-offset-2 hover:underline" onClick={() => locateMediaMessage(message.id, message.conversationId)} type="button"><Search size={13} />{t.mediaLocate}</button><a className="inline-flex items-center gap-1 text-slate-500 underline-offset-2 hover:underline" href={mediaDownloadUrl(message)} download={message.body ?? "download"}><Download size={13} />{t.downloadOriginal}</a></div>
                        </div>
                      ))}
                    </div>
                    {historyCursors[selected.id] ? <button className="mt-4 w-full rounded border border-line px-3 py-2 text-sm font-medium text-ink hover:border-brand disabled:opacity-50" disabled={historyLoading} onClick={loadOlderMessages} type="button">{historyLoading ? t.loadingOlder : t.mediaLoadOlder}</button> : null}
                  </div>
                </>
              )}
            </div>
          </div>
        ) : null}

        {archivePreview ? (
          <div className="fixed inset-0 z-[2147483645] bg-slate-950/45 p-4" onClick={() => setArchivePreview(null)}>
            <div className="mx-auto mt-10 flex max-h-[82vh] w-full max-w-lg flex-col rounded bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{archivePreview.fileName}</p>
                  <p className="text-xs text-slate-500">{archivePreview.totalEntries} {uiLabel(uiLanguage, { zh: "项", en: "items", hi: "आइटम" })}{archivePreview.truncated ? uiLabel(uiLanguage, { zh: "，显示前 300 项", en: ", showing first 300", hi: ", पहले 300 दिखाए गए" }) : ""}</p>
                </div>
                <button className="rounded border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-brand" onClick={() => setArchivePreview(null)} type="button">{t.adminClose}</button>
              </div>
              <div className="min-h-0 flex-1 overflow-auto p-4">
                {archivePreview.loading ? <p className="rounded-2xl border border-line bg-white/80 p-4 text-sm text-slate-500">{t.loadingMessages}</p> : null}
                {archivePreview.error ? <p className="rounded border border-coral/30 bg-coral/10 p-4 text-sm text-coral">{archivePreview.error}</p> : null}
                {!archivePreview.loading && !archivePreview.error && archivePreview.entries.length === 0 ? <p className="rounded-2xl border border-line bg-white/80 p-4 text-sm text-slate-500">{uiLabel(uiLanguage, { zh: "压缩包为空", en: "Archive is empty", hi: "आर्काइव खाली है" })}</p> : null}
                <div className="space-y-2">
                  {archivePreview.entries.map((entry, index) => (
                    <div key={`${entry.name}-${index}`} className="rounded border border-line px-3 py-2 text-sm">
                      <p className="break-all font-medium text-ink">{entry.directory ? "[dir] " : ""}{entry.name}</p>
                      {!entry.directory ? <p className="mt-1 text-xs text-slate-500">{Math.round(entry.size / 1024)} KB</p> : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}
        {documentPreview && !documentPreviewMinimized ? (
          <div className="fixed inset-0 z-[2147483646] bg-slate-950/70 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))] sm:p-4" data-document-preview-modal="open" onClick={closeDocumentPreview}>
            <div className="relative mx-auto flex h-full max-h-none w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-h-[94vh]" onClick={(event) => event.stopPropagation()}>
              <button className="absolute right-3 top-3 z-20 grid h-10 w-10 place-items-center rounded-xl border border-line bg-white text-slate-600 shadow-sm hover:border-brand hover:text-ink focus:outline-none focus:ring-2 focus:ring-brand/30" data-document-preview-close="true" onClick={closeDocumentPreview} title={t.adminClose} aria-label={t.adminClose} type="button"><X size={19} /></button>
              <div className="flex shrink-0 flex-col gap-2 border-b border-line px-3 pb-2 pt-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-4 sm:py-3">
                <div className="min-w-0 pr-12">
                  <p className="truncate font-semibold text-ink">{documentPreview.fileName}</p>
                  <p className="text-xs text-slate-500">{documentPreview.engine ? `${documentPreview.engine} · ` : ""}{documentPreview.mimeType}</p>
                </div>
                <div className="flex max-w-full shrink-0 items-center gap-2 overflow-x-auto pb-0.5 pr-12 [&>*]:shrink-0 sm:mr-12 sm:overflow-visible sm:pb-0 sm:pr-0">
                  {(documentPreview.kind === "pdf" || documentPreview.kind === "svg" || documentPreview.kind === "image") ? <div className="flex items-center rounded-xl border border-line bg-white">
                    <button className="grid h-8 w-8 place-items-center text-ink disabled:opacity-40" disabled={documentPreviewZoom <= 0.25} onClick={() => setDocumentPreviewZoom((value) => Math.max(0.25, Number((value - 0.25).toFixed(2))))} title={uiLabel(uiLanguage, { zh: "缩小", en: "Zoom out", hi: "ज़ूम आउट" })} type="button"><ZoomOut size={15} /></button>
                    <button className="min-w-14 border-x border-line px-2 text-xs font-medium text-ink" onClick={() => setDocumentPreviewZoom(1)} title={uiLabel(uiLanguage, { zh: "恢复 100%", en: "Reset to 100%", hi: "100% पर रीसेट" })} type="button">{Math.round(documentPreviewZoom * 100)}%</button>
                    <button className="grid h-8 w-8 place-items-center text-ink disabled:opacity-40" disabled={documentPreviewZoom >= 4} onClick={() => setDocumentPreviewZoom((value) => Math.min(4, Number((value + 0.25).toFixed(2))))} title={uiLabel(uiLanguage, { zh: "放大", en: "Zoom in", hi: "ज़ूम इन" })} type="button"><ZoomIn size={15} /></button>
                  </div> : null}
                  {(documentPreview.mimeType === "application/pdf" || documentPreview.fileName.toLowerCase().endsWith(".pdf")) && (documentPreview.kind === "pdf" || documentPreview.kind === "image") ? <div className="flex items-center rounded-xl border border-line bg-white">
                    <button className="grid h-8 w-8 place-items-center text-ink" onClick={() => setDocumentPreviewRotation((value) => (value + 270) % 360)} title={uiLabel(uiLanguage, { zh: "向左旋转 90°", en: "Rotate left 90°", hi: "90° बाएँ घुमाएँ" })} type="button"><RotateCcw size={15} /></button>
                    <span className="min-w-12 border-x border-line px-2 text-center text-xs font-medium text-ink">{documentPreviewRotation}°</span>
                    <button className="grid h-8 w-8 place-items-center text-ink" onClick={() => setDocumentPreviewRotation((value) => (value + 90) % 360)} title={uiLabel(uiLanguage, { zh: "向右旋转 90°", en: "Rotate right 90°", hi: "90° दाएँ घुमाएँ" })} type="button"><RotateCw size={15} /></button>
                  </div> : null}
                  {documentPreview.downloadUrl ? <a className="inline-flex items-center gap-1 rounded-xl border border-line px-3 py-2 text-xs font-medium text-ink hover:border-brand" href={documentPreview.downloadUrl} download={documentPreview.fileName}><Download size={14} />{t.downloadOriginal}</a> : null}
                  <button className="inline-flex h-9 items-center gap-1 rounded-xl border border-line px-2.5 text-xs font-medium text-ink hover:border-brand" data-document-preview-minimize="true" onClick={() => setDocumentPreviewMinimized(true)} title={uiLabel(uiLanguage, { zh: "最小化预览", en: "Minimize preview", hi: "पूर्वावलोकन छोटा करें" })} aria-label={uiLabel(uiLanguage, { zh: "最小化预览", en: "Minimize preview", hi: "पूर्वावलोकन छोटा करें" })} type="button"><Minimize2 size={15} /><span className="hidden sm:inline">{uiLabel(uiLanguage, { zh: "最小化", en: "Minimize", hi: "छोटा करें" })}</span></button>
                </div>
              </div>
              {documentPreview.warning ? <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">{documentPreview.warning}</p> : null}
              {officeFormatOptions(documentPreview.fileName).length ? <div className="flex flex-wrap items-center gap-2 border-b border-line bg-white px-4 py-2 text-xs">
                <button className="inline-flex items-center gap-1 rounded-xl border border-brand/40 bg-brand/5 px-3 py-2 font-medium text-brand hover:border-brand disabled:opacity-50" disabled={documentConverting} onClick={() => void convertPreviewDocument(officeFormatOptions(documentPreview.fileName)[0]!, true)} type="button"><RefreshCw className={documentConverting ? "animate-spin" : ""} size={14} />{uiLabel(uiLanguage, { zh: "修复文件", en: "Repair file", hi: "फ़ाइल सुधारें" })}</button>
                <span className="text-slate-500">{uiLabel(uiLanguage, { zh: "另存为", en: "Save as", hi: "इस रूप में सहेजें" })}</span>
                <select className="rounded-xl border border-line bg-white px-2 py-2 font-medium uppercase text-ink outline-none focus:border-brand" value={documentSaveFormat} onChange={(event) => setDocumentSaveFormat(event.target.value as OfficeConversionFormat)}>{officeFormatOptions(documentPreview.fileName).map((format) => <option key={format} value={format}>{format.toUpperCase()}</option>)}</select>
                <button className="rounded-xl border border-line px-3 py-2 font-medium text-ink hover:border-brand disabled:opacity-50" disabled={documentConverting} onClick={() => void convertPreviewDocument(documentSaveFormat)} type="button">{uiLabel(uiLanguage, { zh: "转换并保存", en: "Convert and save", hi: "बदलें और सहेजें" })}</button>
                {documentPreview.conversionStatus ? <span className="text-slate-600" role="status">{documentPreview.conversionStatus}</span> : null}
                {documentPreview.convertedFile ? <div className="ml-auto flex flex-wrap items-center gap-2 rounded-xl bg-emerald-50 px-2 py-1.5">
                  <span className="max-w-52 truncate font-medium text-emerald-800">{documentPreview.convertedFile.fileName}</span>
                  <a className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-white px-2 py-1.5 font-medium text-emerald-800" href={normalizeMediaUrl(documentPreview.convertedFile.url) ?? documentPreview.convertedFile.url} download={documentPreview.convertedFile.fileName}><Download size={13} />{uiLabel(uiLanguage, { zh: "下载", en: "Download", hi: "डाउनलोड" })}</a>
                  <button className="inline-flex items-center gap-1 rounded-lg bg-brand px-2 py-1.5 font-medium text-white" onClick={() => documentPreview.convertedFile && void sendAssistantGeneratedFile(documentPreview.convertedFile)} type="button"><Send size={13} />{uiLabel(uiLanguage, { zh: "重新发送到聊天", en: "Resend to chat", hi: "चैट में फिर भेजें" })}</button>
                </div> : null}
              </div> : null}
              {translatableDocumentLabel(documentPreview.sourceMessage) && documentPreview.sourceMessage ? <div className="flex flex-wrap items-center gap-2 border-b border-line bg-cyan-50/60 px-4 py-2 text-xs" data-document-translation-source={translatableDocumentLabel(documentPreview.sourceMessage).toLowerCase()}>
                <Languages size={15} className="text-brand" />
                <span className="font-medium text-ink">{uiLabel(uiLanguage, { zh: `翻译 ${translatableDocumentLabel(documentPreview.sourceMessage)} 为`, en: `Translate ${translatableDocumentLabel(documentPreview.sourceMessage)} to`, hi: `${translatableDocumentLabel(documentPreview.sourceMessage)} का अनुवाद` })}</span>
                <select className="max-w-52 rounded-xl border border-line bg-white px-2 py-2 font-medium text-ink outline-none focus:border-brand" value={documentTranslationTarget} onChange={(event) => setDocumentTranslationTarget(event.target.value as TranslationLanguage)} disabled={documentTranslating}>{TRANSLATION_LANGUAGE_OPTIONS.map((item) => <option key={item.code} value={item.code}>{translationLanguageLabelForUi(item, uiLanguage)}</option>)}</select>
                <button className="inline-flex items-center gap-1 rounded-xl bg-brand px-3 py-2 font-medium text-white disabled:opacity-50" disabled={documentTranslating} onClick={() => void translatePreviewDocument()} type="button"><Languages className={documentTranslating ? "animate-pulse" : ""} size={14} />{documentTranslating ? uiLabel(uiLanguage, { zh: "翻译中…", en: "Translating…", hi: "अनुवाद…" }) : uiLabel(uiLanguage, { zh: "开始翻译", en: "Translate", hi: "अनुवाद करें" })}</button>
                {documentTranslationStatus ? <span className="min-w-48 flex-1 text-slate-600" role="status">{documentTranslationStatus}</span> : null}
                {documentTranslatedFile ? <div className="ml-auto flex flex-wrap items-center gap-2 rounded-xl bg-emerald-50 px-2 py-1.5">
                  <span className="max-w-48 truncate font-medium text-emerald-800">{documentTranslatedFile.fileName}</span>
                  {(["original", "translated", "bilingual"] as const).map((mode) => <button key={mode} className={`rounded-lg border px-2 py-1.5 font-medium ${documentTranslationViewMode === mode ? "border-brand bg-brand text-white" : "border-emerald-200 bg-white text-emerald-800 hover:border-brand"}`} onClick={() => setTranslatedPdfViewMode(mode)} type="button" aria-pressed={documentTranslationViewMode === mode}>{mode === "original" ? uiLabel(uiLanguage, { zh: "原文", en: "Original", hi: "मूल" }) : mode === "translated" ? uiLabel(uiLanguage, { zh: "译文", en: "Translation", hi: "अनुवाद" }) : uiLabel(uiLanguage, { zh: "双语对照", en: "Bilingual", hi: "द्विभाषी" })}</button>)}
                  <a className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-white px-2 py-1.5 font-medium text-emerald-800" href={mediaUrlWithFileName(documentTranslatedFile.url, documentTranslatedFile.fileName, true)} download={documentTranslatedFile.fileName}><Download size={13} />{uiLabel(uiLanguage, { zh: "下载", en: "Download", hi: "डाउनलोड" })}</a>
                  <button className="inline-flex items-center gap-1 rounded-lg bg-brand px-2 py-1.5 font-medium text-white" onClick={() => void sendAssistantGeneratedFile(documentTranslatedFile)} type="button"><Send size={13} />{uiLabel(uiLanguage, { zh: "发送到聊天", en: "Send to chat", hi: "चैट में भेजें" })}</button>
                </div> : null}
              </div> : null}
              <div className="min-h-0 flex-1 bg-slate-100 p-2 sm:p-3">
                {documentPreview.loading ? <div className="grid h-full place-items-center text-sm text-slate-500">{uiLabel(uiLanguage, { zh: "正在生成本地预览…", en: "Preparing local preview…", hi: "स्थानीय पूर्वावलोकन तैयार हो रहा है…" })}</div> : null}
                {documentPreview.error ? <div className="grid h-full place-items-center"><p className="rounded border border-coral/30 bg-white p-4 text-sm text-coral">{documentPreview.error}</p></div> : null}
                {!documentPreview.loading && !documentPreview.error && documentPreview.kind === "pdf" && documentPreview.url && documentTranslationViewMode === "original" ? <DocumentPdfViewer url={documentPreview.url} fileName={documentPreview.fileName} zoom={documentPreviewZoom} rotation={documentPreviewRotation} onZoomChange={setDocumentPreviewZoom} scrollProgress={documentPreviewScrollProgress} onScrollProgressChange={setDocumentPreviewScrollProgress} /> : null}
                {!documentPreview.loading && !documentPreview.error && documentPreview.kind === "presentation" && documentPreview.url && documentTranslationViewMode === "original" ? <DocumentPdfViewer url={documentPreview.url} fileName={documentPreview.fileName} zoom={documentPreviewZoom} rotation={documentPreviewRotation} onZoomChange={setDocumentPreviewZoom} scrollProgress={documentPreviewScrollProgress} onScrollProgressChange={setDocumentPreviewScrollProgress} /> : null}
                {!documentPreview.loading && !documentPreview.error && documentPreview.kind === "html" && documentPreview.content && documentTranslationViewMode === "original" ? <iframe className="h-full w-full rounded-xl border border-line bg-white" data-office-document-preview="true" sandbox="" srcDoc={`<!doctype html><html><head><meta charset="utf-8"><style>body{box-sizing:border-box;max-width:980px;margin:0 auto;padding:32px;font:15px/1.65 system-ui,sans-serif;color:#172033}img{max-width:100%;height:auto}table{border-collapse:collapse;max-width:100%}td,th{border:1px solid #cbd5e1;padding:6px}</style></head><body>${documentPreview.content}</body></html>`} title={documentPreview.fileName} /> : null}
                {!documentPreview.loading && !documentPreview.error && documentPreview.kind === "spreadsheet" && documentPreview.content && documentTranslationViewMode === "original" ? <SpreadsheetPreview content={documentPreview.content} /> : null}
                {!documentPreview.loading && !documentPreview.error && documentTranslatedFile && documentTranslationViewMode === "translated" ? <DocumentPdfViewer url={normalizeMediaUrl(documentTranslatedFile.url) ?? documentTranslatedFile.url} fileName={documentTranslatedFile.fileName} zoom={documentPreviewZoom} rotation={documentPreviewRotation} onZoomChange={setDocumentPreviewZoom} scrollProgress={documentPreviewScrollProgress} onScrollProgressChange={setDocumentPreviewScrollProgress} /> : null}
                {!documentPreview.loading && !documentPreview.error && documentPreview.url && documentTranslatedFile && documentTranslationViewMode === "bilingual" ? <div className="grid h-full min-h-0 grid-cols-1 gap-2 lg:grid-cols-2" data-document-translation-view="bilingual">
                  <section className="flex min-h-[320px] min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-white lg:min-h-0"><h3 className="border-b border-line px-3 py-2 text-xs font-semibold text-ink">{uiLabel(uiLanguage, { zh: "原文", en: "Original", hi: "मूल" })}</h3><div className="min-h-0 flex-1">{documentPreview.kind === "pdf" ? <DocumentPdfViewer url={documentPreview.url} fileName={documentPreview.fileName} zoom={documentPreviewZoom} rotation={documentPreviewRotation} onZoomChange={setDocumentPreviewZoom} scrollProgress={documentPreviewScrollProgress} onScrollProgressChange={setDocumentPreviewScrollProgress} /> : <DocumentZoomSurface className="h-full overflow-auto bg-white p-2" zoom={documentPreviewZoom} onZoomChange={setDocumentPreviewZoom}><div className="mx-auto grid min-h-full min-w-full place-items-center p-2"><img className="block origin-center object-contain" style={{ width: `${documentPreviewZoom * 100}%`, maxWidth: "none", height: "auto", transform: `rotate(${documentPreviewRotation}deg)` }} src={documentPreview.url} alt={documentPreview.fileName} /></div></DocumentZoomSurface>}</div></section>
                  <section className="flex min-h-[320px] min-w-0 flex-col overflow-hidden rounded-xl border border-brand/30 bg-white lg:min-h-0"><h3 className="border-b border-brand/20 bg-brand/5 px-3 py-2 text-xs font-semibold text-brand">{uiLabel(uiLanguage, { zh: "译文", en: "Translation", hi: "अनुवाद" })}</h3><div className="min-h-0 flex-1"><DocumentPdfViewer url={normalizeMediaUrl(documentTranslatedFile.url) ?? documentTranslatedFile.url} fileName={documentTranslatedFile.fileName} zoom={documentPreviewZoom} rotation={documentPreviewRotation} onZoomChange={setDocumentPreviewZoom} scrollProgress={documentPreviewScrollProgress} onScrollProgressChange={setDocumentPreviewScrollProgress} /></div></section>
                </div> : null}
                {!documentPreview.loading && !documentPreview.error && documentPreview.kind === "svg" && documentPreview.content && documentTranslationViewMode === "original" ? <DocumentZoomSurface className="h-full overflow-auto rounded bg-white p-2" zoom={documentPreviewZoom} onZoomChange={setDocumentPreviewZoom}><div className="origin-top-left [&_svg]:block [&_svg]:h-auto [&_svg]:w-full" style={{ width: `${documentPreviewZoom * 100}%`, minWidth: "640px" }} dangerouslySetInnerHTML={{ __html: documentPreview.content }} /></DocumentZoomSurface> : null}
                {!documentPreview.loading && !documentPreview.error && documentPreview.kind === "image" && documentPreview.url && documentTranslationViewMode === "original" ? <DocumentZoomSurface className="h-full overflow-auto rounded bg-white p-2" zoom={documentPreviewZoom} onZoomChange={setDocumentPreviewZoom}><div className="mx-auto grid min-h-full min-w-full place-items-center p-2"><img className="block origin-center object-contain transition-transform" style={{ width: `${documentPreviewZoom * 100}%`, maxWidth: "none", height: "auto", transform: (documentPreview.mimeType === "application/pdf" || documentPreview.fileName.toLowerCase().endsWith(".pdf")) ? `rotate(${documentPreviewRotation}deg)` : undefined }} src={documentPreview.url} alt={documentPreview.fileName} /></div></DocumentZoomSurface> : null}
                {!documentPreview.loading && !documentPreview.error && documentPreview.kind === "text" && documentTranslationViewMode === "original" ? <pre className="h-full overflow-auto whitespace-pre-wrap break-words rounded bg-white p-4 text-sm text-ink">{documentPreview.content}</pre> : null}
                {!documentPreview.loading && !documentPreview.error && documentPreview.kind === "unsupported" && documentTranslationViewMode === "original" ? <div className="grid h-full place-items-center"><p className="max-w-xl rounded-2xl border border-line bg-white p-5 text-center text-sm text-slate-600">{documentPreview.warning || uiLabel(uiLanguage, { zh: "当前文件暂时无法在浏览器中预览，请下载后用本机程序打开。", en: "This file cannot be previewed in the browser. Download it to open locally.", hi: "इस फ़ाइल का ब्राउज़र में पूर्वावलोकन नहीं हो सकता। इसे डाउनलोड करके खोलें।" })}</p></div> : null}
              </div>
            </div>
          </div>
        ) : null}
        {documentPreview && documentPreviewMinimized ? (
          <button ref={documentPreviewFloatingButtonRef} className="fixed z-[2147483645] flex max-w-[min(22rem,calc(100vw-1.5rem))] cursor-grab touch-none items-center gap-3 rounded-2xl border border-brand/30 bg-white px-3 py-2.5 text-left text-ink shadow-2xl transition hover:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 active:cursor-grabbing" style={documentPreviewFloatingPosition ? { left: documentPreviewFloatingPosition.x, top: documentPreviewFloatingPosition.y } : { right: "max(0.75rem, env(safe-area-inset-right))", bottom: "calc(max(0.75rem, env(safe-area-inset-bottom)) + 6.5rem)" }} data-document-preview-floating="true" onClick={restoreDocumentPreviewFromFloating} onPointerDown={beginDocumentPreviewFloatingDrag} onPointerMove={moveDocumentPreviewFloatingDrag} onPointerUp={endDocumentPreviewFloatingDrag} onPointerCancel={endDocumentPreviewFloatingDrag} title={uiLabel(uiLanguage, { zh: "拖动可移动，点击重新打开文件预览", en: "Drag to move; click to restore file preview", hi: "स्थान बदलने के लिए खींचें; पूर्वावलोकन खोलने के लिए क्लिक करें" })} aria-label={uiLabel(uiLanguage, { zh: `拖动可移动；点击重新打开 ${documentPreview.fileName} 预览`, en: `Drag to move; click to restore preview for ${documentPreview.fileName}`, hi: `स्थान बदलने के लिए खींचें; ${documentPreview.fileName} का पूर्वावलोकन खोलने के लिए क्लिक करें` })} type="button">
            <GripVertical className="shrink-0 text-slate-400" size={16} aria-hidden="true" />
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand text-white ${documentPreview.loading || documentTranslating || documentConverting ? "animate-pulse" : ""}`}><FileText size={19} /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{documentPreview.fileName}</span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">{documentTranslating ? uiLabel(uiLanguage, { zh: "正在后台翻译…", en: "Translating in background…", hi: "पृष्ठभूमि में अनुवाद…" }) : documentConverting ? uiLabel(uiLanguage, { zh: "正在后台转换…", en: "Converting in background…", hi: "पृष्ठभूमि में रूपांतरण…" }) : documentPreview.loading ? uiLabel(uiLanguage, { zh: "正在后台生成预览…", en: "Preparing preview in background…", hi: "पृष्ठभूमि में पूर्वावलोकन तैयार…" }) : uiLabel(uiLanguage, { zh: "文件预览已最小化", en: "File preview minimized", hi: "फ़ाइल पूर्वावलोकन छोटा किया गया" })}</span>
            </span>
            <Maximize2 className="shrink-0 text-brand" size={18} />
          </button>
        ) : null}
        {contactActionMenu && typeof document !== "undefined" ? createPortal((() => {
          const user = visibleFriends.find((friend) => friend.id === contactActionMenu.userId);
          if (!user) return null;
          const starred = (contactTags[user.id] ?? []).includes(STARRED_CONTACT_TAG);
          return <div className="fixed inset-0 z-[2147483647]" onClick={() => setContactActionMenu(null)} onContextMenu={(event) => { event.preventDefault(); setContactActionMenu(null); }} role="presentation">
            <div className="fixed w-44 rounded-2xl border border-line bg-white p-1.5 shadow-2xl" style={{ left: contactActionMenu.x, top: contactActionMenu.y }} data-contact-action-menu={user.id} onClick={(event) => event.stopPropagation()} role="menu">
              <button className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-ink hover:bg-brand/10 disabled:opacity-50" disabled={contactTagsSavingId === user.id} onClick={() => void toggleStarredContact(user.id)} role="menuitem" type="button">
                <Star className={starred ? "fill-amber-400 text-amber-500" : "text-slate-500"} size={17} />
                {starred ? uiLabel(uiLanguage, { zh: "取消星标", en: "Remove star", hi: "तारा हटाएं" }) : uiLabel(uiLanguage, { zh: "星标", en: "Star", hi: "तारांकित करें" })}
              </button>
            </div>
          </div>;
        })(), document.body) : null}
        {contactDetailsUser ? renderContactDetails(contactDetailsUser) : null}
                {renderGroupDetails()}
        {renderGroupModal()}
        {groupCallPicker ? (
          <div className="fixed inset-0 z-[2147483646] grid place-items-center bg-slate-950/60 p-4" onClick={() => { setGroupCallPicker(null); setGroupCallMemberIds([]); setGroupCallError(""); }}>
            <div className="w-full max-w-md rounded-3xl border border-white/80 bg-white p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
                <div className="min-w-0">
                  <p className="text-base font-semibold text-ink">{t.callSelectMembers}</p>
                  <p className="mt-1 text-xs text-slate-500">{groupCallPicker.media === "video" ? callLabels[uiLanguage].videoCall : callLabels[uiLanguage].audioCall} · {t.callSelectMembersHint}</p>
                </div>
                <button className="shrink-0 rounded border border-line px-3 py-2 text-xs font-medium text-ink hover:border-brand" onClick={() => { setGroupCallPicker(null); setGroupCallMemberIds([]); setGroupCallError(""); }} type="button">{t.callCancel}</button>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 text-xs">
                <span className="font-medium text-slate-600">{t.callSelected} {groupCallMemberIds.length}</span>
                <div className="flex gap-2">
                  <button className="rounded border border-brand/40 px-2.5 py-1.5 font-medium text-brand hover:border-brand disabled:opacity-50" disabled={groupCallLoading || groupMembersLoading} onClick={selectAllGroupCallMembers} type="button">{t.callSelectAll}</button>
                  <button className="rounded border border-line px-2.5 py-1.5 font-medium text-ink hover:border-brand disabled:opacity-50" disabled={groupCallLoading || groupMembersLoading} onClick={clearGroupCallMembers} type="button">{t.callClearAll}</button>
                </div>
              </div>
              <div className="mt-3 max-h-72 overflow-auto rounded-2xl border border-line">
                {groupCallLoading || groupMembersLoading ? <p className="px-3 py-6 text-center text-sm text-slate-500">{t.searching}</p> : null}
                {!groupCallLoading && !groupMembersLoading && groupMembers.filter((member) => member.user.id !== currentUser?.id).length === 0 ? <p className="px-3 py-6 text-center text-sm text-slate-500">{t.callNoMembers}</p> : null}
                {!groupCallLoading && !groupMembersLoading ? groupMembers.filter((member) => member.user.id !== currentUser?.id).map((member) => {
                  const checked = groupCallMemberIds.includes(member.user.id);
                  return (
                    <label key={member.user.id} className="flex cursor-pointer items-center gap-3 border-b border-line px-3 py-2.5 last:border-b-0 hover:bg-paper">
                      <input className="h-4 w-4 accent-brand" type="checkbox" checked={checked} onChange={() => toggleGroupCallMember(member.user.id)} />
                      <Avatar name={displayUserName(member.user)} url={member.user.avatarUrl} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{displayUserName(member.user)}</span>
                    </label>
                  );
                }) : null}
              </div>
              {groupCallError ? <p className="mt-3 rounded-xl border border-coral/30 bg-coral/10 px-3 py-2 text-sm text-coral">{groupCallError}</p> : null}
              <button className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-brand px-4 text-sm font-semibold text-white shadow-sm hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50" disabled={groupCallLoading || groupMembersLoading || groupCallMemberIds.length === 0} onClick={confirmGroupCall} type="button">
                {groupCallPicker.media === "video" ? <Video size={17} /> : <Phone size={17} />}{t.callStart}
              </button>
            </div>
          </div>
        ) : null}
        {incomingCall ? (
          <div className="fixed inset-x-4 top-4 z-[2147483645] mx-auto max-w-sm rounded-2xl border border-line bg-white p-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <Avatar name={incomingCall.fromName ?? selected.name} url={selected.avatarUrl} kind={selected.type === "group" ? "group" : "user"} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-ink">{incomingCall.fromName ?? selected.name}</p>
                <p className="text-sm text-slate-500">{incomingCall.media === "video" ? callLabels[uiLanguage].incomingVideo : callLabels[uiLanguage].incomingAudio}</p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button className="flex-1 rounded bg-brand px-3 py-2 text-sm font-medium text-white" onClick={() => void acceptIncomingCall()} type="button">{callLabels[uiLanguage].accept}</button>
              <button className="flex-1 rounded border border-coral px-3 py-2 text-sm font-medium text-coral" onClick={rejectIncomingCall} type="button">{callLabels[uiLanguage].reject}</button>
            </div>
          </div>
        ) : null}
        {activeCall ? (
          <div className={callExpanded ? "fixed inset-0 z-[2147483645] flex flex-col overflow-hidden bg-slate-950 text-white" : "fixed bottom-4 right-4 z-[2147483645] w-[min(92vw,420px)] overflow-hidden rounded-2xl border border-line bg-white shadow-2xl"}>
            <div className={callExpanded ? "flex items-center justify-between gap-3 border-b border-white/10 bg-slate-950 px-4 py-3 text-white" : "flex items-center justify-between gap-3 border-b border-line px-4 py-3"}>
              <div className="min-w-0">
                <p className={callExpanded ? "truncate text-lg font-semibold text-white" : "truncate font-semibold text-ink"}>{activeCall.peerName}</p>
                <p className={callExpanded ? "text-sm text-white/65" : "text-sm text-slate-500"}>{activeCall.status === "ringing" ? callLabels[uiLanguage].calling : activeCall.status === "connecting" ? callLabels[uiLanguage].connecting : callLabels[uiLanguage].inCall}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button className={callExpanded ? "grid h-9 w-9 place-items-center rounded-full border border-white/20 text-white" : "grid h-9 w-9 place-items-center rounded-full border border-line text-ink"} onClick={() => setCallExpanded((value) => !value)} type="button" aria-label={callExpanded ? uiLabel(uiLanguage, { zh: "退出全屏", en: "Exit full screen", hi: "पूर्ण स्क्रीन से बाहर" }) : uiLabel(uiLanguage, { zh: "全屏", en: "Full screen", hi: "पूर्ण स्क्रीन" })} title={callExpanded ? uiLabel(uiLanguage, { zh: "退出全屏", en: "Exit full screen", hi: "पूर्ण स्क्रीन से बाहर" }) : uiLabel(uiLanguage, { zh: "全屏", en: "Full screen", hi: "पूर्ण स्क्रीन" })}>
                  {callExpanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
                </button>
                <button className="grid h-9 w-9 place-items-center rounded-full bg-coral text-white" onClick={() => endActiveCall(true)} type="button" aria-label={callLabels[uiLanguage].end} title={callLabels[uiLanguage].end}><PhoneOff size={17} /></button>
              </div>
            </div>
            {callExpanded ? (
              <div className="relative min-h-0 flex-1 overflow-hidden bg-slate-950 p-2">
                <div className="h-full min-h-0">
                  {focusedCallTile ? <CallVideoTile {...focusedCallTile} expanded={true} focused={true} avatarUrl={focusedCallTile.avatarUrl} /> : null}
                </div>
                {floatingCallTile ? (
                  <div
                    className="absolute left-0 top-0 z-10 touch-none select-none overflow-hidden rounded border border-white/25 bg-slate-900 shadow-2xl"
                    style={{ width: callPipSize.width, height: callPipSize.height, transform: `translate(${callPipPosition.x}px, ${callPipPosition.y}px)` }}
                    onPointerDown={beginCallPipDrag}
                    onPointerMove={moveCallPip}
                    onPointerUp={endCallPipDrag}
                    onPointerCancel={endCallPipDrag}
                  >
                    <CallVideoTile
                      {...floatingCallTile}
                      compact={true}
                      avatarUrl={floatingCallTile.avatarUrl}
                      onClick={() => {
                        if (callPipSuppressClickRef.current) {
                          callPipSuppressClickRef.current = false;
                          return;
                        }
                        setFocusedCallTileId(floatingCallTile.id);
                      }}
                    />
                    <div
                      className="absolute bottom-1 right-1 h-5 w-5 cursor-nwse-resize rounded-sm border-b-2 border-r-2 border-white/80 bg-black/20"
                      onPointerDown={beginCallPipResize}
                      onPointerMove={moveCallPipResize}
                      onPointerUp={endCallPipResize}
                      onPointerCancel={endCallPipResize}
                      aria-hidden="true"
                    />
                  </div>
                ) : null}
                {remoteCallStreams.length === 0 ? <div className="pointer-events-none absolute inset-x-4 bottom-4 rounded bg-black/45 px-3 py-2 text-center text-sm text-white/70">{callLabels[uiLanguage].noRemote}</div> : null}
              </div>
            ) : (
              <div className="grid max-h-[50vh] grid-cols-2 gap-2 overflow-auto bg-slate-950 p-2">
                {callTiles.map((tile) => <CallVideoTile key={tile.id} {...tile} avatarUrl={tile.avatarUrl} onClick={() => setFocusedCallTileId(tile.id)} />)}
                {remoteCallStreams.length === 0 ? <div className="grid min-h-28 place-items-center rounded bg-slate-900 px-3 text-center text-sm text-white/70">{callLabels[uiLanguage].noRemote}</div> : null}
              </div>
            )}
            {callError ? <p className={callExpanded ? "border-t border-white/10 bg-slate-950 px-4 py-2 text-sm text-coral" : "border-t border-line px-4 py-2 text-sm text-coral"}>{callError}</p> : null}
            <div className={callExpanded ? "absolute inset-x-0 bottom-6 z-20 flex flex-wrap items-center justify-center gap-3 px-4" : "flex flex-wrap items-center justify-center gap-3 border-t border-line px-4 py-3"}>
              <button className={`grid h-12 w-12 place-items-center rounded-full border text-sm font-medium shadow-lg ${activeCall.muted ? "border-coral bg-coral text-white" : callExpanded ? "border-white/20 bg-black/45 text-white" : "border-line bg-white text-ink"}`} onClick={toggleCallMute} type="button" title={activeCall.muted ? callLabels[uiLanguage].unmute : callLabels[uiLanguage].mute} aria-label={activeCall.muted ? callLabels[uiLanguage].unmute : callLabels[uiLanguage].mute}>
                {activeCall.muted ? <MicOff size={19} /> : <Mic size={19} />}
              </button>
              {activeCall.media === "video" ? (
                <>
                  <button className={`grid h-12 w-12 place-items-center rounded-full border text-sm font-medium shadow-lg ${activeCall.cameraOff ? "border-coral bg-coral text-white" : callExpanded ? "border-white/20 bg-black/45 text-white" : "border-line bg-white text-ink"}`} onClick={toggleCallCamera} type="button" title={activeCall.cameraOff ? callLabels[uiLanguage].cameraOn : callLabels[uiLanguage].cameraOff} aria-label={activeCall.cameraOff ? callLabels[uiLanguage].cameraOn : callLabels[uiLanguage].cameraOff}>
                    {activeCall.cameraOff ? <VideoOff size={19} /> : <Video size={19} />}
                  </button>
                  <button className={callExpanded ? "grid h-12 w-12 place-items-center rounded-full border border-white/20 bg-black/45 text-white shadow-lg" : "grid h-12 w-12 place-items-center rounded-full border border-line bg-white text-ink shadow-lg"} onClick={() => void switchCallCamera()} type="button" title={uiLabel(uiLanguage, { zh: "切换摄像头", en: "Switch camera", hi: "कैमरा बदलें" })} aria-label={uiLabel(uiLanguage, { zh: "切换摄像头", en: "Switch camera", hi: "कैमरा बदलें" })}>
                    <RefreshCw size={19} />
                  </button>
                </>
              ) : null}
            </div>
          </div>
        ) : null}      {screenshotEditorOpen ? (
          <div className='fixed inset-0 z-[2147483647] flex flex-col bg-slate-950/95 p-3 text-white sm:p-5'>
            <div className='mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-3'>
              <div>
                <p className='text-base font-semibold'>{t.screenshotTool}</p>
                <p className='mt-1 text-xs text-white/65'>{uiLabel(uiLanguage, { zh: '拖动框选区域；也可以直接在截图上画框、画箭头或添加文字。', en: 'Drag to select an area, or draw a box, arrow, or text on the screenshot.', hi: 'क्षेत्र चुनने के लिए खींचें, या स्क्रीनशॉट पर बॉक्स, तीर और टेक्स्ट बनाएं।' })}</p>
              </div>
              <button className='rounded-xl border border-white/20 px-3 py-2 text-sm font-medium text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40' disabled={screenshotOcrLoading || screenshotOcrTranslateLoading} onClick={closeScreenshotEditor} type='button'>{uiLabel(uiLanguage, { zh: '关闭', en: 'Close', hi: 'बंद करें' })}</button>
            </div>
            <div className='relative mx-auto flex w-full max-w-[1400px] flex-wrap items-center gap-1 rounded-2xl border border-white/15 bg-slate-900/90 p-2 shadow-lg'>
              {SCREENSHOT_TOOL_OPTIONS.map(({ value, zh, en, hi }) => {
                const label = uiLabel(uiLanguage, { zh, en, hi });
                return <button key={value} className={`grid h-9 w-9 place-items-center rounded-lg text-xs font-medium ${screenshotTool === value ? 'bg-white text-slate-900' : 'text-white hover:bg-white/10'}`} onClick={() => setScreenshotTool(value)} type='button' title={label} aria-label={label}>{screenshotToolIcon(value)}<span className='sr-only'>{label}</span></button>;
              })}
              <button className='h-9 rounded-lg border border-emerald-300/60 px-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-400/15' onClick={() => selectFullScreenshot()} type='button' title={uiLabel(uiLanguage, { zh: '整张截图', en: 'Full screen', hi: 'पूरी स्क्रीन' })}>{uiLabel(uiLanguage, { zh: '整张', en: 'Full', hi: 'पूर्ण' })}</button>
              <button className='h-9 rounded-lg border border-violet-300/60 px-2 text-xs font-semibold text-violet-100 hover:bg-violet-400/15 disabled:opacity-40' disabled={screenshotOcrLoading || screenshotOcrTranslateLoading || !accessToken} onClick={() => void runScreenshotOcr()} type='button' title={uiLabel(uiLanguage, { zh: '图片 OCR', en: 'Image OCR', hi: 'इमेज OCR' })}>{screenshotOcrLoading ? '...' : uiLabel(uiLanguage, { zh: 'OCR', en: 'OCR', hi: 'OCR' })}</button>
              <button className='h-9 rounded-lg border border-emerald-300/60 px-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-400/15 disabled:opacity-40' disabled={screenshotOcrLoading || screenshotOcrTranslateLoading || !accessToken} onClick={() => void runScreenshotOcr(screenshotOcrTargetLanguage)} type='button' title={uiLabel(uiLanguage, { zh: '按原图位置和样式翻译图片文字', en: 'Translate text in place', hi: 'टेक्स्ट का उसी स्थान पर अनुवाद करें' })}>{screenshotOcrTranslateLoading ? '...' : uiLabel(uiLanguage, { zh: '图片翻译', en: 'Translate', hi: 'अनुवाद' })}</button>
              <button className='grid h-9 w-9 place-items-center rounded-lg border border-white/20 text-white hover:bg-white/10 disabled:opacity-40' disabled={screenshotRotationBusy} onClick={() => void rotateScreenshot(-90)} type='button' aria-label={t.rotateLeft} title={t.rotateLeft}><RotateCcw size={15} /></button>
              <button className='grid h-9 w-9 place-items-center rounded-lg border border-white/20 text-white hover:bg-white/10 disabled:opacity-40' disabled={screenshotRotationBusy} onClick={() => void rotateScreenshot(90)} type='button' aria-label={t.rotateRight} title={t.rotateRight}><RotateCw size={15} /></button>
              <span className='grid h-9 min-w-9 place-items-center rounded-lg border border-white/10 px-1 text-xs text-white/65' title={uiLabel(uiLanguage, { zh: '当前旋转角度', en: 'Rotation', hi: 'घुमाव' })}>{screenshotRotation}°</span>
              <button className='h-9 rounded-lg border border-white/20 px-2 text-xs font-medium text-white hover:bg-white/10 disabled:opacity-40' disabled={screenshotUndoStack.length === 0 || screenshotRotationBusy} onClick={undoScreenshotAnnotation} type='button' title={uiLabel(uiLanguage, { zh: '撤销', en: 'Undo', hi: 'पूर्ववत' })}>{uiLabel(uiLanguage, { zh: '撤销', en: 'Undo', hi: 'पूर्ववत' })}</button>
              <button className='h-9 rounded-lg border border-white/20 px-2 text-xs font-medium text-white hover:bg-white/10 disabled:opacity-40' disabled={screenshotRedoStack.length === 0 || screenshotRotationBusy} onClick={redoScreenshotAnnotation} type='button' title={uiLabel(uiLanguage, { zh: '重做', en: 'Redo', hi: 'फिर से करें' })}>{uiLabel(uiLanguage, { zh: '重做', en: 'Redo', hi: 'फिर से करें' })}</button>
              <button className='grid h-9 w-9 place-items-center rounded-lg border border-white/20 text-white hover:bg-white/10' onClick={() => screenshotColorInputRef.current?.click()} type='button' title={uiLabel(uiLanguage, { zh: '颜色', en: 'Color', hi: 'रंग' })} aria-label={uiLabel(uiLanguage, { zh: '颜色', en: 'Color', hi: 'रंग' })}><span className='h-5 w-5 rounded-md border border-white/60' style={{ backgroundColor: screenshotColor }} /></button>
              <input ref={screenshotColorInputRef} className='sr-only' type='color' value={screenshotColor} onChange={(event) => setScreenshotColor(event.target.value)} />
              {(['pen', 'highlight', 'mosaic', 'text'] as ScreenshotTool[]).includes(screenshotTool) ? (
                <div className='absolute left-2 right-2 top-full z-30 mt-1 flex flex-wrap items-center gap-1 rounded-xl border border-white/20 bg-slate-900/95 p-1.5 shadow-2xl sm:left-auto'>
                  {screenshotTool === 'pen' ? SCREENSHOT_PEN_TYPE_OPTIONS.map((option) => (
                    <button key={option.value} className={`grid h-8 w-8 place-items-center rounded-lg text-xs ${screenshotPenType === option.value ? 'bg-white text-slate-900' : 'text-white hover:bg-white/10'}`} onClick={() => setScreenshotPenType(option.value)} type='button' title={uiLabel(uiLanguage, { zh: option.zh, en: option.en, hi: option.hi })} aria-label={uiLabel(uiLanguage, { zh: option.zh, en: option.en, hi: option.hi })}>
                      {option.value === 'round' ? '●' : option.value === 'square' ? '■' : '╱'}
                    </button>
                  )) : null}
                  {SCREENSHOT_SIZE_OPTIONS.map((size) => (
                    <button key={size} className={`h-8 min-w-8 rounded-lg px-2 text-xs font-semibold ${screenshotStrokeWidth === size ? 'bg-brand text-white' : 'text-white hover:bg-white/10'}`} onClick={() => setScreenshotStrokeWidth(size)} type='button' aria-pressed={screenshotStrokeWidth === size} title={uiLabel(uiLanguage, { zh: `大小 ${size}`, en: `Size ${size}`, hi: `आकार ${size}` })}>{size}</button>
                  ))}
                </div>
              ) : null}
              {screenshotTextPoint ? (
                <div className='flex min-w-[min(100%,20rem)] flex-1 items-center gap-2 text-xs text-white/80'>
                  <span>{uiLabel(uiLanguage, { zh: '正在编辑文字：点击截图旁边确认', en: 'Editing text: click beside it to confirm', hi: 'टेक्स्ट संपादित हो रहा है: पुष्टि के लिए बाहर क्लिक करें' })}</span>
                  <button className='rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10' onClick={cancelScreenshotTextEdit} type='button'>{uiLabel(uiLanguage, { zh: '取消', en: 'Cancel', hi: 'रद्द करें' })}</button>
                  <button className='rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-900 disabled:opacity-50' disabled={!screenshotTextDraft.trim()} onClick={commitScreenshotText} type='button'>{uiLabel(uiLanguage, { zh: '确认', en: 'Confirm', hi: 'पुष्टि करें' })}</button>
                </div>
              ) : null}
            </div>
            {screenshotOcrLoading || screenshotOcrTranslateLoading || screenshotOcrText ? (
              <div className='mx-auto mt-2 w-full max-w-[1400px] rounded-2xl border border-violet-300/40 bg-violet-950/55 p-3 shadow-lg'>
                <div className='flex flex-wrap items-center gap-2'>
                  <p className='mr-auto text-sm font-semibold text-violet-100'>{uiLabel(uiLanguage, { zh: `图片 OCR 已定位 ${screenshotOcrBlocks.length} 处`, en: `Image OCR: ${screenshotOcrBlocks.length} positioned blocks`, hi: `इमेज OCR: ${screenshotOcrBlocks.length} स्थान` })}</p>
                  <button className='rounded-lg border border-white/20 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10 disabled:opacity-40' disabled={!screenshotOcrText.trim()} onClick={() => void copyScreenshotOcrText()} type='button'>{uiLabel(uiLanguage, { zh: '复制结果', en: 'Copy result', hi: 'परिणाम कॉपी करें' })}</button>
                  <select className='h-8 max-w-44 rounded-lg border border-white/20 bg-slate-900 px-2 text-xs text-white outline-none focus:border-violet-300' value={screenshotOcrTargetLanguage} onChange={(event) => setScreenshotOcrTargetLanguage(event.target.value as TranslationLanguage)} aria-label={uiLabel(uiLanguage, { zh: '图片文字翻译语言', en: 'Image translation language', hi: 'छवि अनुवाद भाषा' })}>
                    {TRANSLATION_LANGUAGE_OPTIONS.map((item) => <option key={item.code} value={item.code}>{translationLanguageLabelForUi(item, uiLanguage)}</option>)}
                  </select>
                  <button className='rounded-lg border border-emerald-300/50 px-3 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-400/15 disabled:opacity-40' disabled={!screenshotOcrText.trim() || screenshotOcrLoading || screenshotOcrTranslateLoading} onClick={() => void runScreenshotOcr(screenshotOcrTargetLanguage)} type='button'>{screenshotOcrTranslateLoading ? '...' : uiLabel(uiLanguage, { zh: '翻译图片文字', en: 'Translate image text', hi: 'छवि टेक्स्ट अनुवाद' })}</button>
                  <button className='rounded-lg border border-white/20 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10 disabled:opacity-40' disabled={!screenshotOcrTranslationText.trim()} onClick={() => void copyScreenshotOcrText(true)} type='button'>{uiLabel(uiLanguage, { zh: '复制译文', en: 'Copy translation', hi: 'अनुवाद कॉपी करें' })}</button>
                  <button className='rounded-lg border border-white/20 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10' onClick={clearScreenshotOcrResults} type='button'>{uiLabel(uiLanguage, { zh: '清空', en: 'Clear', hi: 'साफ़ करें' })}</button>
                </div>
                {screenshotOcrStatus ? <p className={`mt-2 rounded-lg border px-3 py-2 text-xs ${screenshotOcrStatus.kind === 'error' ? 'border-rose-300/50 bg-rose-400/10 text-rose-100' : screenshotOcrStatus.kind === 'success' ? 'border-emerald-300/50 bg-emerald-400/10 text-emerald-100' : 'border-violet-300/40 bg-violet-400/10 text-violet-100'}`} role={screenshotOcrStatus.kind === 'error' ? 'alert' : 'status'}>{screenshotOcrStatus.message}</p> : null}
                <div className={`mt-2 grid gap-2 ${screenshotOcrTranslationText ? 'md:grid-cols-2' : ''}`}>
                  <textarea className='min-h-24 w-full resize-y rounded-xl border border-violet-200/30 bg-white px-3 py-2 text-sm leading-6 text-ink outline-none focus:border-violet-300' value={screenshotOcrText} onChange={(event) => setScreenshotOcrText(event.target.value)} placeholder={uiLabel(uiLanguage, { zh: 'OCR 原文', en: 'OCR original text', hi: 'OCR मूल टेक्स्ट' })} aria-label={uiLabel(uiLanguage, { zh: 'OCR 原文', en: 'OCR original text', hi: 'OCR मूल टेक्स्ट' })} />
                  {screenshotOcrTranslationText ? <textarea className='min-h-24 w-full resize-y rounded-xl border border-emerald-200/30 bg-white px-3 py-2 text-sm leading-6 text-ink outline-none focus:border-emerald-300' value={screenshotOcrTranslationText} onChange={(event) => setScreenshotOcrTranslationText(event.target.value)} placeholder={uiLabel(uiLanguage, { zh: '图片文字译文', en: 'Image text translation', hi: 'छवि टेक्स्ट अनुवाद' })} aria-label={uiLabel(uiLanguage, { zh: '图片文字译文', en: 'Image text translation', hi: 'छवि टेक्स्ट अनुवाद' })} /> : null}
                </div>
              </div>
            ) : null}
            <div className='relative mx-auto flex min-h-0 w-full max-w-[1400px] flex-1 items-center justify-center overflow-auto py-3'>
              <div className='relative inline-block max-h-[72vh] max-w-full'>
              <canvas
                ref={screenshotCanvasRef}
                className='block max-h-[72vh] max-w-full touch-none select-none rounded-lg bg-black object-contain shadow-2xl'
                width={screenshotSourceSize.width || undefined}
                height={screenshotSourceSize.height || undefined}
                onPointerDown={handleScreenshotPointerDown}
                onPointerMove={handleScreenshotPointerMove}
                onPointerUp={handleScreenshotPointerUp}
                onPointerCancel={handleScreenshotPointerUp}
                onDoubleClick={handleScreenshotDoubleClick}
                onPointerLeave={(event) => { if (screenshotGestureRef.current?.tool !== 'pen' && screenshotGestureRef.current?.tool !== 'highlight' && screenshotGestureRef.current?.tool !== 'mosaic') handleScreenshotPointerMove(event); }}
                aria-label={t.screenshotTool}
              />
              {screenshotOcrBlocks.filter((block) => !block.translatedText).map((block) => (
                <div
                  key={block.id}
                  className='pointer-events-none absolute z-[9] overflow-hidden rounded border border-violet-200/80 bg-violet-950/75 px-1.5 py-1 text-left leading-tight text-white shadow-lg backdrop-blur-[1px]'
                  style={{
                    left: `${block.x / Math.max(1, screenshotSourceSize.width) * 100}%`,
                    top: `${block.y / Math.max(1, screenshotSourceSize.height) * 100}%`,
                    width: `${Math.max(2, block.width / Math.max(1, screenshotSourceSize.width) * 100)}%`,
                    minHeight: `${Math.max(2, block.height / Math.max(1, screenshotSourceSize.height) * 100)}%`,
                    fontSize: 'clamp(10px, 1.1vw, 16px)'
                  }}
                  title={block.translatedText ? `${block.text}\n${block.translatedText}` : block.text}
                >
                  <span className='block whitespace-pre-wrap break-words font-semibold'>{block.text}</span>
                  {block.translatedText ? <span className='mt-0.5 block whitespace-pre-wrap break-words border-t border-emerald-200/50 pt-0.5 font-semibold text-emerald-100'>{block.translatedText}</span> : null}
                </div>
              ))}
              {selectedScreenshotTextAnnotation && selectedScreenshotTextBounds && screenshotSourceSize.width > 0 && screenshotSourceSize.height > 0 ? (
                <div
                  className='pointer-events-none absolute z-10 border-2 border-emerald-300'
                  style={{
                    left: `${selectedScreenshotTextBounds.x / screenshotSourceSize.width * 100}%`,
                    top: `${selectedScreenshotTextBounds.y / screenshotSourceSize.height * 100}%`,
                    width: `${Math.min(100, selectedScreenshotTextBounds.width / screenshotSourceSize.width * 100)}%`,
                    height: `${Math.min(100, selectedScreenshotTextBounds.height / screenshotSourceSize.height * 100)}%`
                  }}
                >
                  <button
                    className='pointer-events-auto absolute -bottom-2 -right-2 h-4 w-4 cursor-nwse-resize rounded-sm border-2 border-white bg-emerald-400 shadow'
                    aria-label={uiLabel(uiLanguage, { zh: '拖动缩放文字', en: 'Resize text', hi: 'टेक्स्ट का आकार बदलें' })}
                    onPointerDown={(event) => handleScreenshotTextResizeDown(event, selectedScreenshotTextAnnotation.id)}
                    onPointerMove={handleScreenshotTextResizeMove}
                    onPointerUp={handleScreenshotTextResizeUp}
                    onPointerCancel={handleScreenshotTextResizeUp}
                    type='button'
                  />
                </div>
              ) : null}
              {screenshotTextPoint && screenshotSourceSize.width > 0 && screenshotSourceSize.height > 0 ? (
                <textarea
                  ref={screenshotTextInputRef}
                  className='pointer-events-auto absolute z-20 min-h-10 min-w-44 max-w-[min(70%,28rem)] resize rounded-lg border-2 border-emerald-300 bg-white/95 px-2 py-1 text-sm font-semibold leading-6 text-ink shadow-xl outline-none'
                  style={{
                    left: `${screenshotTextPoint.x / screenshotSourceSize.width * 100}%`,
                    top: `${screenshotTextPoint.y / screenshotSourceSize.height * 100}%`
                  }}
                  value={screenshotTextDraft}
                  onChange={(event) => setScreenshotTextDraft(event.target.value)}
                  onPointerDown={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') { event.preventDefault(); cancelScreenshotTextEdit(); }
                    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); commitScreenshotText(); }
                  }}
                  placeholder={uiLabel(uiLanguage, { zh: '直接输入文字', en: 'Type text here', hi: 'यहां टेक्स्ट लिखें' })}
                  aria-label={uiLabel(uiLanguage, { zh: '截图文字输入', en: 'Screenshot text input', hi: 'स्क्रीनशॉट टेक्स्ट इनपुट' })}
                />
              ) : null}
              {screenshotSelection && screenshotSelection.width >= 6 && screenshotSelection.height >= 6 && screenshotSourceSize.width > 0 ? (
                <div
                  className='hidden'
                  style={{
                    left: ((screenshotSelection.x + screenshotSelection.width / 2) / screenshotSourceSize.width * 100) + '%',
                    top: ((screenshotSelection.y + screenshotSelection.height) / screenshotSourceSize.height * 100) + '%',
                    transform: 'translate(-50%, 10px)'
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  {([
                    ['select', '\u6846\u9009', 'Select', 'चयन'],
                    ['pen', '\u753b\u7b14', 'Pen', 'पेन'],
                    ['highlight', '\u9ad8\u4eae', 'Highlight', 'हाइलाइट'],
                    ['mosaic', '\u9a6c\u8d5b\u514b', 'Mosaic', 'मोज़ेक'],
                    ['rectangle', '\u77e9\u5f62', 'Rectangle', 'आयत'],
                    ['ellipse', '\u692d\u5706', 'Ellipse', 'अंडाकार'],
                    ['arrow', '\u7bad\u5934', 'Arrow', 'तीर'],
                    ['text', '\u6587\u5b57', 'Text', 'टेक्स्ट']
                  ] as const).map(([tool, zh, en, hi]) => (
                    <button
                      key={tool}
                      className={'rounded-xl px-2.5 py-2 text-xs font-medium ' + (screenshotTool === tool ? 'bg-white text-slate-900' : 'text-white hover:bg-white/10')}
                      onClick={() => setScreenshotTool(tool as ScreenshotTool)}
                      type='button'
                    >
                      {uiLabel(uiLanguage, { zh, en, hi })}
                    </button>
                  ))}
                  <label className='inline-flex items-center gap-1 rounded-xl px-2 py-1.5 text-xs text-white/80'>
                    <span>{uiLabel(uiLanguage, { zh: '\u989c\u8272', en: 'Color', hi: 'रंग' })}</span>
                    <input className='h-7 w-8 cursor-pointer rounded border border-white/20 bg-transparent p-0.5' type='color' value={screenshotColor} onChange={(event) => setScreenshotColor(event.target.value)} />
                  </label>
                  <select className='h-8 rounded-xl border border-white/20 bg-slate-900 px-2 text-xs text-white' value={screenshotStrokeWidth} onChange={(event) => setScreenshotStrokeWidth(Number(event.target.value))}>
                    <option value={2}>2</option>
                    <option value={4}>4</option>
                    <option value={6}>6</option>
                    <option value={10}>10</option>
                  </select>
                  {screenshotTextPoint ? (
                    <div className='flex basis-full items-center gap-2 pt-1'>
                      <input className='h-9 min-w-0 flex-1 rounded-xl border border-white/20 bg-white px-3 text-sm text-ink outline-none' value={screenshotTextDraft} onChange={(event) => setScreenshotTextDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitScreenshotText(); } }} placeholder={uiLabel(uiLanguage, { zh: '\u8f93\u5165\u6587\u5b57\u540e\u70b9\u786e\u5b9a', en: 'Type text and confirm', hi: 'टेक्स्ट लिखकर पुष्टि करें' })} />
                      <button className='rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-900 disabled:opacity-50' disabled={!screenshotTextDraft.trim()} onClick={commitScreenshotText} type='button'>{uiLabel(uiLanguage, { zh: '\u786e\u5b9a', en: 'Add', hi: 'जोड़ें' })}</button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              </div>
            </div>
            <div className='mx-auto flex w-full max-w-[1400px] flex-wrap items-center gap-2 border-t border-white/15 pt-3'>
              <p className='mr-auto text-xs text-white/65'>{screenshotSelection ? uiLabel(uiLanguage, { zh: '已选择区域，导出时将裁剪到选区。', en: 'An area is selected; export will crop to it.', hi: 'क्षेत्र चुना गया है; एक्सपोर्ट में इसी क्षेत्र को क्रॉप किया जाएगा।' }) : uiLabel(uiLanguage, { zh: '未框选时导出完整截图。', en: 'Without a selection, the full screenshot is exported.', hi: 'क्षेत्र न चुनने पर पूरा स्क्रीनशॉट एक्सपोर्ट होगा।' })}</p>
              <button className='rounded-xl border border-white/20 px-3 py-2 text-xs font-medium text-white hover:bg-white/10 disabled:opacity-40' disabled={screenshotUndoStack.length === 0} onClick={undoScreenshotAnnotation} type='button'>{uiLabel(uiLanguage, { zh: '撤销', en: 'Undo', hi: 'पूर्ववत' })}</button>
              <button className='rounded-xl border border-white/20 px-3 py-2 text-xs font-medium text-white hover:bg-white/10 disabled:opacity-40' disabled={screenshotRedoStack.length === 0} onClick={redoScreenshotAnnotation} type='button'>{uiLabel(uiLanguage, { zh: '重做', en: 'Redo', hi: 'फिर से करें' })}</button>
              <button className='rounded-xl border border-white/20 px-3 py-2 text-xs font-medium text-white hover:bg-white/10' onClick={resetScreenshotAnnotations} type='button'>{uiLabel(uiLanguage, { zh: '重置', en: 'Reset', hi: 'रीसेट' })}</button>
              <button className='rounded-xl border border-white/20 px-3 py-2 text-xs font-medium text-white hover:bg-white/10' onClick={() => void copyScreenshot()} type='button'>{uiLabel(uiLanguage, { zh: '复制', en: 'Copy', hi: 'कॉपी' })}</button>
              <button className='rounded-xl border border-white/20 px-3 py-2 text-xs font-medium text-white hover:bg-white/10' onClick={() => void downloadScreenshot()} type='button'>{uiLabel(uiLanguage, { zh: '下载', en: 'Download', hi: 'डाउनलोड' })}</button>
              <button className='rounded-xl bg-brand px-4 py-2 text-xs font-semibold text-white hover:bg-teal-600 disabled:opacity-50' disabled={!selectedExists || mediaUploading} onClick={() => void sendScreenshot()} type='button'>{mediaUploading ? t.uploadingMedia : uiLabel(uiLanguage, { zh: '发送到聊天', en: 'Send to chat', hi: 'चैट में भेजें' })}</button>
            </div>
          </div>
        ) : null}      {previewMedia ? (
          <div className={previewMedia.gallery?.length ? "fixed inset-0 z-[2147483647] bg-black" : "fixed inset-0 z-[2147483647] grid place-items-center bg-black/70 p-4"} onClick={() => { setGalleryActionItem(null); setPreviewMedia(null); }}>
            {previewMedia.gallery && previewMedia.gallery.length > 0 ? (
              <>
                <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 bg-gradient-to-b from-black/75 to-transparent px-4 pb-8 pt-4 text-white sm:px-8">
                  <span className="rounded bg-black/55 px-3 py-2 text-sm font-medium">{(previewMedia.galleryIndex ?? 0) + 1} / {previewMedia.gallery.length}</span>
                  <button className="rounded bg-white px-4 py-2 text-sm font-medium text-ink shadow-lg" onClick={(event) => { event.stopPropagation(); setGalleryActionItem(null); setPreviewMedia(null); }} type="button">{t.mediaClose}</button>
                </div>
                <div ref={mediaGalleryScrollRef} className="h-full w-full overflow-y-auto overscroll-contain" onClick={(event) => event.stopPropagation()} onScroll={handleMediaGalleryScroll} style={{ touchAction: "pan-y" }}>
                  {previewMedia.gallery.map((item, index) => (
                    <div key={`${item.id}-${index}`} className="flex w-full items-start justify-center overflow-hidden" onClick={(event) => handleGalleryItemClick(event, item)} onContextMenu={(event) => handleGalleryItemContextMenu(event, item)} onPointerDown={(event) => handleGalleryItemPointerDown(event, item)} onPointerMove={handleGalleryItemPointerMove} onPointerUp={clearGalleryLongPressTimer} onPointerLeave={clearGalleryLongPressTimer} onPointerCancel={clearGalleryLongPressTimer}>
                      {item.type === "video" ? <video className="block h-auto w-full object-contain" src={mediaPreviewUrl(item)} controls playsInline preload="metadata" /> : <img className="block h-auto w-full object-contain" src={mediaPreviewUrl(item)} alt={item.body ?? "Image preview"} draggable={false} />}
                    </div>
                  ))}
                </div>
                {galleryActionItem ? (
                  <div className="absolute inset-x-0 bottom-0 z-30 mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-2 rounded-t-2xl border border-white/20 bg-black/85 p-4 text-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
                    <p className="w-full text-sm font-semibold text-white/90">{uiLabel(uiLanguage, { zh: "照片操作", en: "Photo actions", hi: "फ़ोटो कार्रवाइयाँ" })}</p>
                    <a className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-ink shadow-lg" href={mediaDownloadUrl(galleryActionItem)} download={galleryActionItem.body ?? "download"} onClick={() => { setGalleryActionItem(null); }}>{t.downloadOriginal}</a>
                    <button className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-ink shadow-lg" onClick={() => { setGalleryActionItem(null); setPreviewMedia(null); startReply(galleryActionItem); }} type="button">{uiLabel(uiLanguage, { zh: "评论", en: "Comment", hi: "टिप्पणी" })}</button>
                    <button className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-ink shadow-lg" onClick={() => { void toggleFavoriteMessage(galleryActionItem); setGalleryActionItem(null); }} type="button">{favoriteMessageIds.has(galleryActionItem.id) ? uiLabel(uiLanguage, { zh: "取消收藏", en: "Remove favorite", hi: "पसंद हटाएँ" }) : uiLabel(uiLanguage, { zh: "收藏", en: "Favorite", hi: "पसंदीदा" })}</button>
                    <button className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-ink shadow-lg" onClick={() => { openForwardMessages(previewMedia.gallery ?? [galleryActionItem]); setGalleryActionItem(null); setPreviewMedia(null); }} type="button">{uiLabel(uiLanguage, { zh: "转发相册", en: "Forward album", hi: "एल्बम फ़ॉरवर्ड करें" })}</button>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div className="absolute inset-x-4 top-4 z-10 flex flex-wrap items-center justify-center gap-2">
                  {(previewMedia.type === "image" || previewMedia.type === "avatar" || previewMedia.type === "video") ? (
                    <>
                      <button className="inline-flex items-center gap-1 rounded bg-white px-3 py-2 text-sm font-medium text-ink shadow-lg" onClick={(event) => { event.stopPropagation(); setPreviewRotation((value) => (value + 270) % 360); }} type="button" aria-label={t.rotateLeft}><RotateCcw size={16} />{t.rotateLeft}</button>
                      <button className="inline-flex items-center gap-1 rounded bg-white px-3 py-2 text-sm font-medium text-ink shadow-lg" onClick={(event) => { event.stopPropagation(); setPreviewRotation((value) => (value + 90) % 360); }} type="button" aria-label={t.rotateRight}><RotateCw size={16} />{t.rotateRight}</button>
                      {previewMedia.type === "image" || previewMedia.type === "avatar" ? (
                        <>
                          <button className="inline-flex items-center gap-1 rounded bg-white px-3 py-2 text-sm font-medium text-ink shadow-lg disabled:opacity-40" disabled={previewZoom <= 0.5} onClick={(event) => { event.stopPropagation(); setPreviewZoom((value) => Math.max(0.5, Number((value - 0.25).toFixed(2)))); }} type="button" aria-label={uiLabel(uiLanguage, { zh: "缩小", en: "Zoom out", hi: "ज़ूम आउट" })} title={uiLabel(uiLanguage, { zh: "缩小", en: "Zoom out", hi: "ज़ूम आउट" })}><ZoomOut size={16} /></button>
                          <button className="rounded bg-white px-3 py-2 text-sm font-medium text-ink shadow-lg" onClick={(event) => { event.stopPropagation(); setPreviewZoom(1); }} type="button" aria-label={uiLabel(uiLanguage, { zh: "恢复 100%", en: "Reset zoom", hi: "ज़ूम रीसेट" })}>{Math.round(previewZoom * 100)}%</button>
                          <button className="inline-flex items-center gap-1 rounded bg-white px-3 py-2 text-sm font-medium text-ink shadow-lg disabled:opacity-40" disabled={previewZoom >= 4} onClick={(event) => { event.stopPropagation(); setPreviewZoom((value) => Math.min(4, Number((value + 0.25).toFixed(2)))); }} type="button" aria-label={uiLabel(uiLanguage, { zh: "放大", en: "Zoom in", hi: "ज़ूम इन" })} title={uiLabel(uiLanguage, { zh: "放大", en: "Zoom in", hi: "ज़ूम इन" })}><ZoomIn size={16} /></button>
                        </>
                      ) : null}
                    </>
                   ) : null}
                   {previewMedia.type === "image" || previewMedia.type === "avatar" ? (
                     <button className="inline-flex items-center gap-1 rounded bg-white px-3 py-2 text-sm font-medium text-ink shadow-lg" onClick={(event) => { event.stopPropagation(); void openImageEditorFromPreview(); }} type="button">
                       <Crop size={16} />{uiLabel(uiLanguage, { zh: "\u7f16\u8f91/\u88c1\u526a", en: "Edit / crop", hi: "संपादित / क्रॉप" })}
                     </button>
                   ) : null}
                   <button className="rounded bg-white px-4 py-2 text-sm font-medium text-ink shadow-lg" onClick={(event) => { event.stopPropagation(); setGalleryActionItem(null); setPreviewMedia(null); }} type="button">{t.mediaClose}</button>
                </div>
                <div className="relative flex h-[min(88vh,760px)] w-[min(94vw,960px)] select-none items-center justify-center overflow-auto" onClick={(event) => event.stopPropagation()}>
                   {previewMedia.type === "image" || previewMedia.type === "avatar" ? <img className={`${previewRotationClass} rounded bg-black object-contain`} src={previewMedia.url} alt={previewMedia.name ?? "Image preview"} draggable={false} onWheel={handlePreviewImageWheel} onPointerDown={handlePreviewImagePointerDown} onPointerMove={handlePreviewImagePointerMove} onPointerUp={handlePreviewImagePointerEnd} onPointerCancel={handlePreviewImagePointerEnd} style={{ transform: `rotate(${previewRotation}deg) scale(${previewZoom})`, transformOrigin: previewTransformOrigin, touchAction: "none" }} /> : null}
                  {previewMedia.type === "video" ? (
                    <video
                      className={`block h-auto ${previewRotationClass} rounded bg-black object-contain`}
                      src={previewMedia.url}
                      controls
                      muted={previewMedia.muted}
                      autoPlay
                      playsInline
                      onLoadedMetadata={(event) => {
                        const video = event.currentTarget;
                        if (video.videoWidth > 0 && video.videoHeight > 0) {
                          setPreviewVideoSize({ width: video.videoWidth, height: video.videoHeight });
                        }
                      }}
                      style={{ transform: `rotate(${previewRotation}deg)`, transformOrigin: "center center" }}
                    />
                  ) : null}
                  {previewMedia.type === "audio" ? <div className="rounded bg-white p-4"><p className="mb-3 text-sm font-medium text-ink">{previewMedia.name ?? "Audio"}</p><audio className="w-full" src={previewMedia.url} controls autoPlay /></div> : null}
                </div>
              </>
            )}
          </div>
        ) : null}      </div>
    </main>
  );
}

function CallVideoTile({ name, stream, muted, videoEnabled, expanded = false, focused = false, compact = false, avatarUrl, onClick }: CallTileView & { expanded?: boolean; focused?: boolean; compact?: boolean; onClick?: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const normalizedAvatarUrl = normalizeMediaUrl(avatarUrl ?? undefined);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const hasVideo = Boolean(stream && videoEnabled && stream.getVideoTracks().length > 0);
  useEffect(() => setAvatarFailed(false), [normalizedAvatarUrl]);
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = hasVideo ? stream : null;
      if (hasVideo) void videoRef.current.play().catch(() => undefined);
    }
    if (audioRef.current) {
      audioRef.current.srcObject = !muted && !hasVideo ? stream : null;
      if (!muted && !hasVideo && stream) void audioRef.current.play().catch(() => undefined);
    }
  }, [hasVideo, muted, stream]);
  const initials = name.trim().slice(0, 2).toUpperCase() || "U";
  const tileClass = focused
    ? "relative grid h-full min-h-0 w-full place-items-center overflow-hidden rounded bg-slate-900 text-white"
    : compact
      ? "relative grid h-full w-full place-items-center overflow-hidden rounded bg-slate-900 text-white"
      : expanded
        ? "relative grid min-h-48 place-items-center overflow-hidden rounded bg-slate-900 text-white md:min-h-0"
        : "relative grid min-h-28 place-items-center overflow-hidden rounded bg-slate-900 text-white";
  const avatarClass = focused
    ? "h-28 w-28 text-3xl"
    : compact
      ? "h-16 w-16 text-base"
      : expanded
        ? "h-24 w-24 text-2xl"
        : "h-14 w-14 text-sm";
  return (
    <button className={`${tileClass} ${onClick ? "cursor-pointer" : ""}`} onClick={onClick} type="button">
      {hasVideo ? <video ref={videoRef} className={expanded || focused ? "h-full max-h-full w-full object-contain" : "h-full w-full object-cover"} autoPlay playsInline muted={muted} /> : (
        <div className={`${avatarClass} grid place-items-center overflow-hidden rounded-full bg-brand font-semibold text-white`}>
          {normalizedAvatarUrl && !avatarFailed ? <img className="h-full w-full object-cover" src={normalizedAvatarUrl} alt={name} onError={() => setAvatarFailed(true)} /> : initials}
        </div>
      )}
      {!muted ? <audio ref={audioRef} autoPlay playsInline /> : null}
      <span className="absolute bottom-2 left-2 max-w-[80%] truncate rounded bg-black/60 px-2 py-1 text-xs">{name}</span>
    </button>
  );
}
function OnlineDot({ online, size = "sm", className = "" }: { online: boolean; size?: "xs" | "sm" | "md"; className?: string }) {
  const sizeClass = size === "xs" ? "h-2 w-2" : size === "md" ? "h-3 w-3" : "h-2.5 w-2.5";
  return <span aria-label={online ? "online" : "offline"} title={online ? "Online" : "Offline"} className={`${sizeClass} shrink-0 rounded-full ${online ? "bg-emerald-500" : "bg-slate-300"} ${className}`} />;
}
function TabButton({ active, icon, label, onClick, onDoubleClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void; onDoubleClick?: () => void }) {
  return (
    <button className={`flex h-[3.25rem] min-w-0 flex-col items-center justify-center gap-1 rounded-2xl border px-1 py-1.5 text-center transition ${active ? "border-brand/20 bg-brand/10 font-semibold text-brand shadow-sm" : "border-transparent bg-white/60 text-slate-600 hover:border-line hover:bg-white hover:text-ink"}`} onClick={onClick} onDoubleClick={onDoubleClick}>
      <span className={`grid h-5 w-5 place-items-center ${active ? "text-brand" : "text-slate-500"}`}>{icon}</span>
      <span className="block max-w-full truncate text-[11px] leading-3">{label}</span>
    </button>
  );
}

function Avatar({ name, url, size = "md", kind = "user", online }: { name: string; url?: string | null; size?: "sm" | "md" | "lg"; kind?: "user" | "group"; online?: boolean }) {
  const initials = name.trim().slice(0, 2).toUpperCase() || "U";
  const normalizedUrl = normalizeMediaUrl(url ?? undefined);
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [normalizedUrl]);
  const sizeClass = size === "sm" ? "h-8 w-8 text-xs" : size === "lg" ? "h-16 w-16 text-lg" : "h-11 w-11 text-sm";
  const badgeSizeClass = size === "sm" ? "h-3.5 w-3.5" : size === "lg" ? "h-5 w-5" : "h-4 w-4";
  const badgeIconSize = size === "sm" ? 9 : size === "lg" ? 13 : 10;
  const hasImage = Boolean(normalizedUrl && !imageFailed);
  const onlineDotSizeClass = size === "sm" ? "h-2.5 w-2.5" : size === "lg" ? "h-4 w-4" : "h-3 w-3";
  return (
    <div className={`relative grid ${sizeClass} shrink-0 place-items-center overflow-hidden rounded-2xl ${kind === "group" ? "bg-emerald-700" : "bg-brand"} font-semibold text-white shadow-sm`}>
      {hasImage ? <img className="h-full w-full object-cover" src={normalizedUrl} alt={name} onError={() => setImageFailed(true)} /> : kind === "group" ? <Users size={size === "sm" ? 16 : size === "lg" ? 28 : 20} /> : initials}
      {kind === "group" && hasImage ? <span className={`absolute left-0.5 top-0.5 grid ${badgeSizeClass} place-items-center rounded-sm bg-white/75 text-emerald-800 ring-1 ring-black/10 backdrop-blur-sm`}><Users size={badgeIconSize} /></span> : null}
      {kind === "user" && typeof online === "boolean" ? <span aria-label={online ? "online" : "offline"} title={online ? "Online" : "Offline"} className={`absolute bottom-0.5 right-0.5 ${onlineDotSizeClass} rounded-full ring-2 ring-white ${online ? "bg-emerald-500" : "bg-slate-300"}`} /> : null}
    </div>
  );
}

function BlockToggle({ checked }: { checked: boolean }) {
  return (
    <span aria-hidden="true" className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? "bg-coral" : "bg-slate-300"}`}>
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
    </span>
  );
}
function UnreadBadge({ count }: { count: number }) {
  return <span className="grid h-6 min-w-6 place-items-center rounded-full bg-coral px-2 text-xs font-semibold text-white">{count}</span>;
}
















































































































































































































































