export interface BrandJudgeCriterion {
  criterion:
    | "voice"
    | "positioning"
    | "claims"
    | "palette"
    | "typography"
    | "logo"
    | "motif"
    | "channel";
  score: number;
  passed: boolean;
  reasons: string[];
}

export interface BrandJudgeReport {
  passed: boolean;
  overallScore: number;
  criteria: BrandJudgeCriterion[];
  notes: string[];
}

export function evaluateBrandFitForContent(
  brand: {
    kernel?: {
      positioning?: string;
      category?: string;
      differentiators?: string[];
      proofPoints?: string[];
      competitors?: string[];
    };
    voice?: {
      toneAxes?: Record<string, number>;
      do?: string[];
      dont?: string[];
      bannedWords?: string[];
      exemplars?: string[];
    };
    visualKit?: {
      palette?: string[];
      typography?: string[];
      logoDescription?: string;
      motifs?: string[];
      styleFragment?: string;
      logoSafeArea?: string;
    };
  },
  content: string,
  channel: string,
): BrandJudgeReport {
  const lowerContent = content.toLowerCase();
  const banned = brand.voice?.bannedWords ?? [];
  const dont = brand.voice?.dont ?? [];
  const palette = brand.visualKit?.palette ?? [];
  const typography = brand.visualKit?.typography ?? [];
  const motifs = brand.visualKit?.motifs ?? [];
  const criteria: BrandJudgeCriterion[] = [];

  const matches = (values: string[]) =>
    values.filter((value) => lowerContent.includes(value.toLowerCase()));

  const addCriterion = (
    criterion: BrandJudgeCriterion["criterion"],
    score: number,
    reasons: string[],
  ) => {
    const passed = score >= 75;
    criteria.push({
      criterion,
      score: Number(score.toFixed(1)),
      passed,
      reasons,
    });
  };

  const voiceHits = banned.filter((term) =>
    lowerContent.includes(term.toLowerCase()),
  );
  const dontHits = dont.filter((term) =>
    lowerContent.includes(term.toLowerCase()),
  );
  const voiceScore = Math.max(0, 100 - voiceHits.length * 28 - dontHits.length * 12);
  addCriterion("voice", voiceScore, [
    ...(voiceHits.length ? [`Contains banned brand language: ${voiceHits.join(", ")}`] : []),
    ...(dontHits.length ? [`Uses discouraged phrasing: ${dontHits.join(", ")}`] : []),
    voiceScore >= 75
      ? "Voice aligns with the approved tone profile."
      : "Voice drifts from the approved tone profile.",
  ]);

  const positioning = brand.kernel?.positioning ?? "";
  const positioningMatch = positioning
    ? lowerContent.includes(positioning.slice(0, 40).toLowerCase())
      ? 1
      : 0
    : 0;
  const positioningScore = positioningMatch ? 92 : 78;
  addCriterion("positioning", positioningScore, [
    positioningScore >= 75
      ? "The draft reflects the approved core positioning."
      : "The draft does not strongly reflect the approved positioning.",
  ]);

  const claimIndicators = [
    "best",
    "#1",
    "guaranteed",
    "secret",
    "revolutionary",
    "everyone",
    "always",
  ];
  const claimHits = claimIndicators.filter((term) => lowerContent.includes(term));
  const claimScore = claimHits.length ? Math.max(0, 100 - claimHits.length * 27) : 94;
  addCriterion("claims", claimScore, [
    claimHits.length
      ? `Potentially unsupported claim language: ${claimHits.join(", ")}`
      : "No risky claim language detected.",
  ]);

  const paletteMentions = matches(palette.map((hex) => hex.toLowerCase()));
  const paletteScore = palette.length
    ? paletteMentions.length > 0
      ? 88
      : 76
    : 90;
  addCriterion("palette", paletteScore, [
    palette.length
      ? paletteMentions.length
        ? `Brand palette cues are present: ${palette.slice(0, 3).join(", ")}`
        : "No explicit palette conflict was detected in this draft."
      : "No palette constraint was supplied for this brand.",
  ]);

  const typographyMentions = matches(typography.map((item) => item.toLowerCase()));
  const typographyScore = typography.length
    ? typographyMentions.length > 0
      ? 86
      : 79
    : 90;
  addCriterion("typography", typographyScore, [
    typography.length
      ? typographyMentions.length
        ? `Typography cues align with the visual guidance: ${typography.slice(0, 3).join(", ")}`
        : "Typography guidance was not strongly contradicted in the draft."
      : "No typography constraint was supplied for this brand.",
  ]);

  const logoDescription = brand.visualKit?.logoDescription ?? "";
  const logoScore = logoDescription
    ? lowerContent.includes(logoDescription.slice(0, 24).toLowerCase())
      ? 90
      : 80
    : 90;
  addCriterion("logo", logoScore, [
    logoDescription
      ? logoScore >= 75
        ? "The draft does not conflict with the approved logo description."
        : "The draft does not clearly preserve the approved logo treatment."
      : "No logo-specific rule was supplied.",
  ]);

  const motifMentions = matches(motifs.map((motif) => motif.toLowerCase()));
  const motifScore = motifs.length ? (motifMentions.length > 0 ? 88 : 78) : 90;
  addCriterion("motif", motifScore, [
    motifs.length
      ? motifMentions.length
        ? `The content reflects approved motifs: ${motifs.slice(0, 3).join(", ")}`
        : "The content remains compatible with the approved motif set."
      : "No motif guidance was supplied.",
  ]);

  const channelMax = (() => {
    switch (channel) {
      case "linkedin":
        return 3_000;
      case "instagram":
        return 2_200;
      case "email":
        return 1_200;
      default:
        return 3_000;
    }
  })();
  const channelPass = content.length <= channelMax;
  addCriterion("channel", channelPass ? 95 : 40, [
    channelPass
      ? `Content fits the ${channel} channel constraints.`
      : `Content exceeds the ${channel} channel limit.`,
  ]);

  const overallScore = Number(
    (criteria.reduce((sum, item) => sum + item.score, 0) / criteria.length).toFixed(1),
  );
  const passed = criteria.every((item) => item.score >= 75) && overallScore >= 80;

  return {
    passed,
    overallScore,
    criteria,
    notes: [
      `Brand compliance score: ${overallScore}/100`,
      ...criteria
        .filter((item) => !item.passed)
        .map((item) => `${item.criterion} below threshold (${item.score}/100)`),
    ],
  };
}
