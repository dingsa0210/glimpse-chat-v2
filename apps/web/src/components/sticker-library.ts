export type StickerCategoryDefinition = {
  id: string;
  icon: string;
  zh: string;
  en: string;
  hi: string;
};

export type RichStickerDefinition = {
  id: string;
  category: string;
  emoji: string;
  zh: string;
  en: string;
  hi: string;
  tone: string;
  imageUrl: string;
};

export const STICKER_CATEGORIES: StickerCategoryDefinition[] = [
  { id: "frequent", icon: "🕘", zh: "常用", en: "Frequent", hi: "अक्सर उपयोग" },
  { id: "favorites", icon: "⭐", zh: "收藏", en: "Favorites", hi: "पसंदीदा" },
  { id: "emotion", icon: "😊", zh: "情绪互动", en: "Emotions", hi: "भावनाएँ" },
  { id: "life", icon: "👋", zh: "问候生活", en: "Daily life", hi: "दैनिक जीवन" },
  { id: "support", icon: "🎧", zh: "客户服务", en: "Support", hi: "सहायता" },
  { id: "language", icon: "🌐", zh: "沟通翻译", en: "Language", hi: "भाषा" },
  { id: "work", icon: "💼", zh: "工作商务", en: "Work", hi: "कार्य" },
  { id: "media", icon: "📎", zh: "语音文件", en: "Media", hi: "मीडिया" }
];

const GROUPS: Array<{ category: string; files: string[] }> = [
  {
    category: "frequent",
    files: [
      "01-01-OK.png", "01-02-Thanks.png", "01-03-Got-it.png", "01-04-On-my-way.png",
      "01-05-Busy.png", "01-06-Great.png", "01-07-Sorry.png", "01-08-Good-night.png"
    ]
  },
  {
    category: "language",
    files: [
      "02-01-你好.png", "02-02-Hello.png", "02-03-नमस्ते.png", "02-04-Translate.png",
      "02-05-Voice.png", "02-06-Typing.png", "02-07-File.png", "02-08-Switch.png"
    ]
  },
  {
    category: "work",
    files: [
      "03-01-Meeting.png", "03-02-Approved.png", "03-03-Deadline.png", "03-04-Upload.png",
      "03-05-Download.png", "03-06-Review.png", "03-07-Ship-it.png", "03-08-Done.png"
    ]
  },
  {
    category: "emotion",
    files: [
      "04-01-Happy.png", "04-02-Wow.png", "04-03-Thinking.png", "04-04-Crying.png",
      "04-05-Angry.png", "04-06-Shy.png", "04-07-Love.png", "04-08-Cheer-up.png"
    ]
  },
  {
    category: "life",
    files: [
      "05-01-Good-morning.png", "05-02-Lunch.png", "05-03-Coffee.png", "05-04-Congrats.png",
      "05-05-Welcome.png", "05-06-Safe-trip.png", "05-07-Happy-holiday.png", "05-08-See-you.png"
    ]
  },
  {
    category: "language",
    files: [
      "06-01-Translating.png", "06-02-Done.png", "06-03-Failed.png", "06-04-Speak-slow.png",
      "06-05-Not-clear.png", "06-06-Switch-language.png", "06-07-Original-OK.png", "06-08-Fixed.png"
    ]
  },
  {
    category: "work",
    files: [
      "07-01-Received.png", "07-02-Confirmed.png", "07-03-Checking.png", "07-04-Need-info.png",
      "07-05-Price-OK.png", "07-06-Approval.png", "07-07-Contract-sent.png", "07-08-Reply-tomorrow.png"
    ]
  },
  {
    category: "media",
    files: [
      "08-01-Voice.png", "08-02-Listening.png", "08-03-Mic-issue.png", "08-04-Bad-signal.png",
      "08-05-Call-later.png", "08-06-In-meeting.png", "08-07-Send-voice.png", "08-08-Transcribed.png"
    ]
  },
  {
    category: "media",
    files: [
      "09-01-File-sent.png", "09-02-Image-received.png", "09-03-Video-too-big.png", "09-04-Upload-again.png",
      "09-05-Downloaded.png", "09-06-Unsupported.png", "09-07-Compressing.png", "09-08-Archived.png"
    ]
  },
  {
    category: "support",
    files: [
      "10-01-Welcome.png", "10-02-Processing.png", "10-03-Please-wait.png", "10-04-Sorry.png",
      "10-05-Reported.png", "10-06-Solved.png", "10-07-Rate-us.png", "10-08-See-you.png"
    ]
  },
  {
    category: "frequent",
    files: [
      "11-01-Like.png", "11-02-Handshake.png", "11-03-Hug.png", "11-04-Clap.png",
      "11-05-Wave.png", "11-06-Heart.png", "11-07-Salute.png", "11-08-OK.png"
    ]
  },
  {
    category: "emotion",
    files: [
      "12-01-Peek.png", "12-02-LOL.png", "12-03-Facepalm.png", "12-04-Awkward.png",
      "12-05-Shocked.png", "12-06-Speechless.png", "12-07-Hehe.png", "12-08-Shrug.png"
    ]
  },
  {
    category: "emotion",
    files: [
      "13-01-Comfort.png", "13-02-Pat-pat.png", "13-03-Cheer.png", "13-04-Love-you.png",
      "13-05-Tissue.png", "13-06-High-five.png", "13-07-Thanks.png", "13-08-Celebrate.png"
    ]
  }
];

function labelFromFile(file: string) {
  return file.replace(/^\d{2}-\d{2}-/, "").replace(/\.png$/i, "").replace(/-/g, " ");
}

const LABEL_TRANSLATIONS: Record<string, { zh: string; hi: string }> = {
  "OK": { zh: "好的", hi: "ठीक है" },
  "Thanks": { zh: "谢谢", hi: "धन्यवाद" },
  "Got it": { zh: "明白了", hi: "समझ गया" },
  "On my way": { zh: "在路上", hi: "रास्ते में हूँ" },
  "Busy": { zh: "忙碌中", hi: "व्यस्त हूँ" },
  "Great": { zh: "太棒了", hi: "बहुत बढ़िया" },
  "Sorry": { zh: "抱歉", hi: "माफ़ कीजिए" },
  "Good night": { zh: "晚安", hi: "शुभ रात्रि" },
  "你好": { zh: "你好", hi: "नमस्ते" },
  "Hello": { zh: "你好", hi: "नमस्ते" },
  "नमस्ते": { zh: "你好", hi: "नमस्ते" },
  "Translate": { zh: "翻译", hi: "अनुवाद" },
  "Voice": { zh: "语音", hi: "आवाज़" },
  "Typing": { zh: "正在输入", hi: "टाइप कर रहा है" },
  "File": { zh: "文件", hi: "फ़ाइल" },
  "Switch": { zh: "切换", hi: "बदलें" },
  "Meeting": { zh: "会议", hi: "मीटिंग" },
  "Approved": { zh: "已批准", hi: "स्वीकृत" },
  "Deadline": { zh: "截止日期", hi: "अंतिम तिथि" },
  "Upload": { zh: "上传", hi: "अपलोड" },
  "Download": { zh: "下载", hi: "डाउनलोड" },
  "Review": { zh: "审核", hi: "समीक्षा" },
  "Ship it": { zh: "可以发布", hi: "भेज दें" },
  "Done": { zh: "完成", hi: "पूरा हुआ" },
  "Happy": { zh: "开心", hi: "खुश" },
  "Wow": { zh: "哇", hi: "वाह" },
  "Thinking": { zh: "思考中", hi: "सोच रहा हूँ" },
  "Crying": { zh: "哭泣", hi: "रो रहा हूँ" },
  "Angry": { zh: "生气", hi: "गुस्सा" },
  "Shy": { zh: "害羞", hi: "शर्मा रहा हूँ" },
  "Love": { zh: "喜欢", hi: "प्यार" },
  "Cheer up": { zh: "加油", hi: "हिम्मत रखिए" },
  "Good morning": { zh: "早上好", hi: "सुप्रभात" },
  "Lunch": { zh: "吃午饭", hi: "दोपहर का खाना" },
  "Coffee": { zh: "喝咖啡", hi: "कॉफ़ी" },
  "Congrats": { zh: "恭喜", hi: "बधाई" },
  "Welcome": { zh: "欢迎", hi: "स्वागत है" },
  "Safe trip": { zh: "一路平安", hi: "शुभ यात्रा" },
  "Happy holiday": { zh: "节日快乐", hi: "शुभ त्योहार" },
  "See you": { zh: "再见", hi: "फिर मिलेंगे" },
  "Translating": { zh: "翻译中", hi: "अनुवाद हो रहा है" },
  "Failed": { zh: "失败", hi: "विफल" },
  "Speak slow": { zh: "请说慢一点", hi: "धीरे बोलिए" },
  "Not clear": { zh: "没听清", hi: "स्पष्ट नहीं" },
  "Switch language": { zh: "切换语言", hi: "भाषा बदलें" },
  "Original OK": { zh: "原文正确", hi: "मूल पाठ सही है" },
  "Fixed": { zh: "已修正", hi: "सुधार दिया" },
  "Received": { zh: "已收到", hi: "प्राप्त हुआ" },
  "Confirmed": { zh: "已确认", hi: "पुष्टि हुई" },
  "Checking": { zh: "检查中", hi: "जाँच जारी है" },
  "Need info": { zh: "需要资料", hi: "जानकारी चाहिए" },
  "Price OK": { zh: "价格可以", hi: "कीमत ठीक है" },
  "Approval": { zh: "等待审批", hi: "अनुमोदन" },
  "Contract sent": { zh: "合同已发送", hi: "अनुबंध भेजा" },
  "Reply tomorrow": { zh: "明天回复", hi: "कल जवाब दूँगा" },
  "Listening": { zh: "正在听", hi: "सुन रहा हूँ" },
  "Mic issue": { zh: "麦克风故障", hi: "माइक में समस्या" },
  "Bad signal": { zh: "信号不好", hi: "सिग्नल कमजोर है" },
  "Call later": { zh: "稍后通话", hi: "बाद में कॉल करें" },
  "In meeting": { zh: "会议中", hi: "मीटिंग में हूँ" },
  "Send voice": { zh: "发送语音", hi: "वॉइस भेजें" },
  "Transcribed": { zh: "已转文字", hi: "लिखित पाठ तैयार" },
  "File sent": { zh: "文件已发送", hi: "फ़ाइल भेजी गई" },
  "Image received": { zh: "图片已收到", hi: "चित्र मिला" },
  "Video too big": { zh: "视频太大", hi: "वीडियो बहुत बड़ा है" },
  "Upload again": { zh: "重新上传", hi: "फिर अपलोड करें" },
  "Downloaded": { zh: "已下载", hi: "डाउनलोड हुआ" },
  "Unsupported": { zh: "不支持", hi: "समर्थित नहीं" },
  "Compressing": { zh: "压缩中", hi: "कंप्रेस हो रहा है" },
  "Archived": { zh: "已归档", hi: "संग्रहित" },
  "Processing": { zh: "处理中", hi: "प्रक्रिया जारी है" },
  "Please wait": { zh: "请稍候", hi: "कृपया प्रतीक्षा करें" },
  "Reported": { zh: "已反馈", hi: "रिपोर्ट किया" },
  "Solved": { zh: "已解决", hi: "समाधान हुआ" },
  "Rate us": { zh: "请评价", hi: "हमें रेट करें" },
  "Like": { zh: "点赞", hi: "पसंद" },
  "Handshake": { zh: "握手", hi: "हाथ मिलाएँ" },
  "Hug": { zh: "拥抱", hi: "गले लगना" },
  "Clap": { zh: "鼓掌", hi: "तालियाँ" },
  "Wave": { zh: "挥手", hi: "हाथ हिलाना" },
  "Heart": { zh: "爱心", hi: "दिल" },
  "Salute": { zh: "敬礼", hi: "सलाम" },
  "Peek": { zh: "偷看", hi: "झाँकना" },
  "LOL": { zh: "笑死了", hi: "ज़ोर से हँसी" },
  "Facepalm": { zh: "捂脸", hi: "माथा पकड़ना" },
  "Awkward": { zh: "尴尬", hi: "असहज" },
  "Shocked": { zh: "震惊", hi: "हैरान" },
  "Speechless": { zh: "无语", hi: "निःशब्द" },
  "Hehe": { zh: "嘿嘿", hi: "हेहे" },
  "Shrug": { zh: "不知道", hi: "पता नहीं" },
  "Comfort": { zh: "安慰", hi: "सांत्वना" },
  "Pat pat": { zh: "拍拍", hi: "थपकी" },
  "Cheer": { zh: "鼓励", hi: "हौसला" },
  "Love you": { zh: "爱你", hi: "आपसे प्यार है" },
  "Tissue": { zh: "递纸巾", hi: "रूमाल लीजिए" },
  "High five": { zh: "击掌", hi: "हाई फ़ाइव" },
  "Celebrate": { zh: "庆祝", hi: "जश्न" }
};

const STICKER_PACKS = [
  { id: "glimpse-v4", directory: "glimpse-v4-lite" },
  { id: "glimpse-v5", directory: "glimpse-v5-comic" }
] as const;

function imageUrl(directory: string, file: string) {
  return `/stickers/${directory}/${encodeURIComponent(file)}`;
}

export const RICH_STICKERS: RichStickerDefinition[] = STICKER_PACKS.flatMap((pack) =>
  GROUPS.flatMap(({ category, files }) =>
    files.map((file) => {
      const label = labelFromFile(file);
      const translated = LABEL_TRANSLATIONS[label];
      return {
        id: `${pack.id}-${file.slice(0, 5)}`,
        category,
        emoji: "",
        zh: translated?.zh ?? label,
        en: label,
        hi: translated?.hi ?? label,
        tone: "from-cyan-50 to-white",
        imageUrl: imageUrl(pack.directory, file)
      };
    })
  )
);
