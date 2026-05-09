export const itemCategoryValues = [
  "alkoholi",
  "dom_in_vrt",
  "drugo",
  "elektronika",
  "hisni_ljubljencki",
  "kava_in_caj",
  "konzervirana_zivila",
  "meso_in_perutnina",
  "mlecni_izdelki_in_jajca",
  "oblacila",
  "osebna_nega",
  "pekovski_izdelki",
  "pijace",
  "pisalne_potrebscine",
  "prigrizki_in_sladkarije",
  "pripravljeni_obroki",
  "rastlinski_izdelki",
  "ribe_in_morski_sadezi",
  "sadje_in_zelenjava",
  "suhi_izdelki",
  "za_otroke",
  "zamrznjeni_izdelki",
  "zacimbe_omake_in_olja",
  "zdravje",
  "ciscenje_in_pranje"
] as const;

export type ItemCategory = (typeof itemCategoryValues)[number];

export function isItemCategory(value: string): value is ItemCategory {
  return (itemCategoryValues as readonly string[]).includes(value);
}

function normalizeForMatch(text: string): string {
  return text
    .trim()
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ");
}

type CategorySignals = {
  strongPhrases: string[];
  phrases: string[];
  tokens: string[];
  avoid?: string[];
};

const CATEGORY_SIGNALS: Record<ItemCategory, CategorySignals> = {
  alkoholi: {
    strongPhrases: ["rdece vino", "belo vino", "craft beer", "penece vino", "brezalkoholno pivo"],
    phrases: ["alkohol", "vino", "beer", "pivo", "whisky", "viski", "vodka", "gin", "rum", "tekila", "sampanjec"],
    tokens: ["liker", "aperol", "prosecco", "brendi", "jager", "jagermeister", "cider"]
  },
  dom_in_vrt: {
    strongPhrases: ["zemlja za roze", "zemlja za roze", "vrtno orodje", "vrtna cev"],
    phrases: ["dom", "vrt", "garden", "orodje", "tools", "zarnica", "žarnica", "gnojilo", "sadil"],
    tokens: ["zemlja", "lopata", "grablj", "vijak", "zebelj", "žebelj", "baterija", "filter", "metla"]
  },
  drugo: {
    strongPhrases: [],
    phrases: [],
    tokens: []
  },
  elektronika: {
    strongPhrases: ["usb kabel", "polnilec usb c", "sd kartica", "baterija aa", "baterija aaa"],
    phrases: ["elektronik", "adapter", "polnilec", "charger", "kabel", "slusalke", "slušalke", "laptop", "tv"],
    tokens: ["usb", "hdmi", "bluetooth", "miška", "miska", "tipkovnica", "powerbank", "router", "monitor", "računalnik", "racunalnik"]
  },
  hisni_ljubljencki: {
    strongPhrases: ["pasja hrana", "mackja hrana", "mačja hrana", "pesek za macke", "pesek za mačke"],
    phrases: ["hisni ljubljen", "hišni ljubljen", "pet food", "pets", "dog food", "cat food"],
    tokens: ["briketi", "macka", "mačka", "pes", "dog", "cat", "praske", "praske", "praskalnik", "povodec"]
  },
  kava_in_caj: {
    strongPhrases: ["zeleni caj", "črni caj", "kapsule za kavo", "kavna zrna", "instant kava"],
    phrases: ["kava", "coffee", "espresso", "caj", "čaj", "tea", "cappuccino", "kapucino"],
    tokens: ["macchiato", "latte", "nescafe", "ilter", "filter", "kamilica", "meta", "earl", "hibiskus"],
    avoid: ["ledeni caj", "ice tea", "energijska pijaca", "proteinski shake"]
  },
  konzervirana_zivila: {
    strongPhrases: ["paradiznik v konzervi", "tuna v konzervi", "koruza v konzervi", "fizol v konzervi"],
    phrases: ["konzerv", "canned", "pelat", "passata", "vlozeno", "vloženo", "kompot"],
    tokens: ["oliva", "olive", "kapre", "sardine", "kisle", "kisli", "pasterizirano", "kozarec"]
  },
  meso_in_perutnina: {
    strongPhrases: ["piscanji file", "piščančji file", "mleto meso", "goveje meso", "svinjsko meso", "puranje meso"],
    phrases: ["meso", "chicken", "beef", "pork", "turkey", "slanina", "ham", "prsut", "pršut"],
    tokens: ["klobasa", "salama", "steak", "zrezek", "cevap", "ćevap", "perut", "jagnje", "telec"]
  },
  mlecni_izdelki_in_jajca: {
    strongPhrases: ["grski jogurt", "grški jogurt", "kisla smetana", "jajca prosta reja", "mleko brez laktoze"],
    phrases: ["mleko", "milk", "sir", "cheese", "jogurt", "yogurt", "maslo", "butter", "jajca", "jajce", "egg"],
    tokens: ["skuta", "kefir", "ricotta", "mozzarella", "parmezan", "feta", "smetana", "puding"]
  },
  oblacila: {
    strongPhrases: ["zimska jakna", "sportna majica", "športna majica", "otroske nogavice", "otroške nogavice"],
    phrases: ["oblacil", "oblačil", "clothes", "majica", "jakna", "shirt", "pants", "hlače", "hlace"],
    tokens: ["nogavice", "pulover", "trenirka", "copati", "cevlji", "čevlji", "kapuca", "pas"]
  },
  osebna_nega: {
    strongPhrases: ["gel za tusiranje", "gel za tuširanje", "zobna pasta", "krema za obraz", "dezodorant roll on"],
    phrases: ["osebna nega", "shampoo", "sampon", "šampon", "dezodorant", "toothpaste", "britvice"],
    tokens: ["milo", "balzam", "pena", "krema", "serum", "ustna voda", "vatke", "robcki", "robčki"]
  },
  pekovski_izdelki: {
    strongPhrases: ["polnozrnat kruh", "toast kruh", "masleni rogljic", "masleni rogljič", "hamburger bombeta"],
    phrases: ["kruh", "bread", "pecivo", "bageta", "baguette", "toast", "rogljic", "rogljič"],
    tokens: ["bombeta", "focaccia", "ciabatta", "štruca", "struca", "žemlja", "zemlja", "krof"]
  },
  pijace: {
    strongPhrases: ["mineralna voda", "pomarancni sok", "pomarančni sok", "proteinski napitek", "gazirana pijaca", "gazirana pijača"],
    phrases: ["pijaca", "pijača", "voda", "water", "sok", "juice", "cola", "nektar", "limonada", "smoothie"],
    tokens: ["fanta", "sprite", "cockta", "tonik", "isostar", "sirup", "napitek", "shake"],
    avoid: ["kava", "coffee", "caj", "čaj", "vino", "beer", "pivo", "vodka", "rum", "whisky"]
  },
  pisalne_potrebscine: {
    strongPhrases: ["kemicni svincnik", "kemični svinčnik", "barvni svincniki", "barvni svinčniki", "samolepilni listki"],
    phrases: ["pisalne", "svincnik", "svinčnik", "kemicni", "kemični", "marker", "zvezek", "papir"],
    tokens: ["radirka", "lepilo", "mapa", "flomaster", "nalivno", "korektor", "blok"]
  },
  prigrizki_in_sladkarije: {
    strongPhrases: ["mlecna cokolada", "mlečna čokolada", "slan krompircek", "slan krompirček", "gumijasti bonboni"],
    phrases: ["prigriz", "sladkar", "snack", "chips", "cips", "čips", "cokolad", "čokolad", "bonbon", "keks", "cookie", "candy"],
    tokens: ["oreo", "milka", "kinder", "nutella", "pokovka", "kokice", "palcke", "palčke", "vafelj"]
  },
  pripravljeni_obroki: {
    strongPhrases: ["instant juha", "gotov obrok", "ready meal", "pripravljena lazanja", "pripravljena lazanja"],
    phrases: ["pripravljen", "ready to eat", "ready-to-eat", "instant obrok", "gotova jed"],
    tokens: ["lazanja", "lasagna", "pizza", "wrap", "burrito", "sendvic", "sendvič", "obrok"]
  },
  rastlinski_izdelki: {
    strongPhrases: ["sojin napitek", "ovseno mleko", "mandljevo mleko", "veganski sir", "veganski burger"],
    phrases: ["rastlinsk", "plant based", "plant-based", "vegan", "veganski", "tofu", "tempeh", "seitan", "soja"],
    tokens: ["humus", "hummus", "falafel", "leca", "leča", "beljakovine", "protein vegan"]
  },
  ribe_in_morski_sadezi: {
    strongPhrases: ["svez losos", "svež losos", "dimljen losos", "tunjevina", "kozice", "morski sadezi", "morski sadeži"],
    phrases: ["riba", "fish", "losos", "tuna", "tun", "lignji", "hobotnica", "morski"],
    tokens: ["sardina", "postrv", "brancin", "orada", "skampi", "škampi", "shrimp", "clam"]
  },
  sadje_in_zelenjava: {
    strongPhrases: ["sveza zelenjava", "sveža zelenjava", "sveze sadje", "sveže sadje", "cesnjev paradiznik", "češnjev paradižnik"],
    phrases: ["sadje", "zelenjava", "fruit", "vegetable", "jabol", "banan", "paradiznik", "krompir", "solata", "korenje", "paprika"],
    tokens: ["kumara", "brokoli", "cvetaca", "cvetača", "cebula", "čebula", "cesen", "česen", "avokado", "limona", "pomaranca", "pomaranča"]
  },
  suhi_izdelki: {
    strongPhrases: ["basmati riz", "basmati riž", "polnozrnate testenine", "ovseni kosmici", "ovseni kosmiči", "pirina moka"],
    phrases: ["riz", "riž", "rice", "testenine", "pasta", "moka", "flour", "oves", "oat", "kosmici", "kosmiči"],
    tokens: ["quinoa", "kvinoja", "bulgur", "kuskus", "couscous", "zdrob", "prosena", "ajdova"]
  },
  za_otroke: {
    strongPhrases: ["otroske plenice", "otroške plenice", "otroska hrana", "otroška hrana", "mlecna formula", "mlečna formula"],
    phrases: ["otroci", "otrok", "baby", "dojen", "plenice", "duda", "kasica", "kašica", "formula"],
    tokens: ["robcki za dojencka", "robčki za dojenčka", "flaška", "flaska", "igraca", "igrača", "vlazilni robcki", "vlažilni robčki"]
  },
  zamrznjeni_izdelki: {
    strongPhrases: ["zamrznjena pizza", "zamrznjena zelenjava", "zamrznjeno sadje", "sladoled na palcki", "sladoled na palčki"],
    phrases: ["zamrzn", "frozen", "sladoled", "zmrzlina", "globoko zamrznjeno"],
    tokens: ["led", "gelato", "sorbet", "pizza", "pomfri", "pomfrit", "grah", "jagode"]
  },
  zacimbe_omake_in_olja: {
    strongPhrases: ["oljcno olje", "oljčno olje", "sojina omaka", "paradiznikova omaka", "paradižnikova omaka", "jabolcni kis", "jabolčni kis"],
    phrases: ["zacimb", "začimb", "spice", "omaka", "sauce", "olje", "oil", "kis", "vinegar", "ketchup", "majonez", "gorcica", "gorčica"],
    tokens: ["origano", "bazilika", "poper", "sol", "kurkuma", "curry", "cili", "čili", "pesto", "salsa"]
  },
  zdravje: {
    strongPhrases: ["vitamin c", "magnezijeve tablete", "omega 3", "oblizi za rane", "obliži za rane"],
    phrases: ["zdravje", "vitamin", "zdravilo", "ibuprofen", "lekadol", "maska", "obliz", "obliž", "supplement"],
    tokens: ["paracetamol", "aspirin", "probiotik", "sirup za kaselj", "sirup za kašelj", "termometer"]
  },
  ciscenje_in_pranje: {
    strongPhrases: ["prasek za perilo", "prašek za perilo", "tekoci detergent", "tekoči detergent", "mehcalec za perilo", "mehčalec za perilo"],
    phrases: ["ciscenje", "čiščenje", "pranje", "detergent", "mehcalec", "mehčalec", "belilo", "cistilo", "čistilo", "razkuzilo", "razkužilo"],
    tokens: ["wc", "kuhinja", "steklo", "spuzva", "goba", "krpa", "vrecke", "vrečke", "sesalec", "pomivalo"]
  }
};

const CATEGORY_PRIORITY: ItemCategory[] = [
  "kava_in_caj",
  "alkoholi",
  "pijace",
  "mlecni_izdelki_in_jajca",
  "meso_in_perutnina",
  "ribe_in_morski_sadezi",
  "sadje_in_zelenjava",
  "pekovski_izdelki",
  "suhi_izdelki",
  "konzervirana_zivila",
  "zamrznjeni_izdelki",
  "prigrizki_in_sladkarije",
  "zacimbe_omake_in_olja",
  "rastlinski_izdelki",
  "pripravljeni_obroki",
  "osebna_nega",
  "ciscenje_in_pranje",
  "zdravje",
  "za_otroke",
  "hisni_ljubljencki",
  "pisalne_potrebscine",
  "oblacila",
  "elektronika",
  "dom_in_vrt",
  "drugo"
];

function tokenize(text: string): string[] {
  return text
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

function uniqueTokens(tokens: string[]): string[] {
  return Array.from(new Set(tokens));
}

function boundedLevenshtein(a: string, b: string, maxDistance = 1): number {
  const lengthDiff = Math.abs(a.length - b.length);
  if (lengthDiff > maxDistance) {
    return maxDistance + 1;
  }

  const dp = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) {
    dp[j] = j;
  }

  for (let i = 1; i <= a.length; i += 1) {
    let prevDiagonal = dp[0];
    dp[0] = i;
    let rowMin = dp[0];

    for (let j = 1; j <= b.length; j += 1) {
      const oldTop = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prevDiagonal + cost);
      prevDiagonal = oldTop;
      if (dp[j] < rowMin) {
        rowMin = dp[j];
      }
    }

    if (rowMin > maxDistance) {
      return maxDistance + 1;
    }
  }

  return dp[b.length];
}

function tokenMatchScore(token: string, candidate: string): number {
  if (token === candidate) {
    return 1;
  }

  if (token.startsWith(candidate) || candidate.startsWith(token)) {
    const minLength = Math.min(token.length, candidate.length);
    if (minLength >= 4) {
      return 0.72;
    }
  }

  if (token.length >= 5 && candidate.length >= 5 && boundedLevenshtein(token, candidate, 1) <= 1) {
    return 0.58;
  }

  return 0;
}

function containsPhrase(haystack: string, phrase: string): boolean {
  const normalizedPhrase = normalizeForMatch(phrase);
  return normalizedPhrase.length > 0 && haystack.includes(normalizedPhrase);
}

function scoreCategory(haystack: string, tokens: string[], signals: CategorySignals): number {
  let score = 0;

  for (const phrase of signals.strongPhrases) {
    if (containsPhrase(haystack, phrase)) {
      score += 9;
    }
  }

  for (const phrase of signals.phrases) {
    if (containsPhrase(haystack, phrase)) {
      score += 5;
    }
  }

  const normalizedTokens = uniqueTokens(tokens.map((token) => normalizeForMatch(token)).filter(Boolean));
  const candidateTokens = uniqueTokens(signals.tokens.map((token) => normalizeForMatch(token)).filter(Boolean));

  for (const token of normalizedTokens) {
    let tokenBest = 0;
    for (const candidate of candidateTokens) {
      tokenBest = Math.max(tokenBest, tokenMatchScore(token, candidate));
      if (tokenBest >= 1) {
        break;
      }
    }

    if (tokenBest >= 1) {
      score += 2.5;
    } else if (tokenBest >= 0.72) {
      score += 1.6;
    } else if (tokenBest >= 0.58) {
      score += 0.9;
    }
  }

  for (const avoidPhrase of signals.avoid ?? []) {
    if (containsPhrase(haystack, avoidPhrase)) {
      score -= 3;
    }
  }

  return score;
}

export function inferCategoryFromTitle(title: string): ItemCategory {
  const haystack = normalizeForMatch(title);
  if (!haystack) {
    return "drugo";
  }

  const tokens = tokenize(haystack);
  if (tokens.length === 0) {
    return "drugo";
  }

  let bestCategory: ItemCategory = "drugo";
  let bestScore = 0;

  for (const category of CATEGORY_PRIORITY) {
    if (category === "drugo") {
      continue;
    }

    const signals = CATEGORY_SIGNALS[category];
    const score = scoreCategory(haystack, tokens, signals);

    if (score > bestScore + 0.35) {
      bestScore = score;
      bestCategory = category;
    }
  }

  return bestScore >= 3.2 ? bestCategory : "drugo";
}
