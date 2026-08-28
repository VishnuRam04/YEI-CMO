import type {
  BrandAnalystModelResult,
  InformationRequest,
  ProductCatalogue,
  SourceReport,
} from "./schema";

function requestId(index: number, field: string): string {
  const slug = field
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 44);
  return `request-${index + 1}-${slug || "information"}`.slice(0, 64);
}

export function buildInformationRequests(input: {
  result: BrandAnalystModelResult;
  reports: SourceReport[];
  productCatalogues: ProductCatalogue[];
}): InformationRequest[] {
  const requests: Omit<InformationRequest, "id">[] = [];
  const seen = new Set<string>();
  const add = (request: Omit<InformationRequest, "id">) => {
    if (seen.has(request.field)) return;
    seen.add(request.field);
    requests.push(request);
  };
  const { kernel } = input.result;

  if (!kernel.pricingPosture || kernel.pricingPosture.position === "unknown") {
    add({
      field: "kernel.pricingPosture",
      severity: "review",
      resolution: "ask-user",
      reason: "The available evidence does not establish how the brand competes on price or value.",
      affects: ["price-objection copy", "offers", "landing-page messaging"],
      canResearch: false,
      question: "How should customers understand your pricing position?",
      options: ["Budget-led", "Value-led", "Mid-market", "Premium value", "Luxury", "Freemium", "Mixed"],
    });
  }

  if (!kernel.founderStory || !kernel.founderStory.originSummary) {
    add({
      field: "kernel.founderStory",
      severity: "optional",
      resolution: "ask-user",
      reason: "No confirmed founder or origin narrative was found in the analyzed sources.",
      affects: ["founder-led content", "company narrative"],
      canResearch: false,
      question: "What confirmed founder or origin story may the agents use?",
      options: [],
    });
  }

  if (!kernel.regulatedClaims || kernel.regulatedClaims.status === "unknown") {
    add({
      field: "kernel.regulatedClaims",
      severity: "review",
      resolution: "ask-user",
      reason: "The category's advertising-claims risk could not be established confidently.",
      affects: ["performance claims", "publication approval"],
      canResearch: false,
      question: "Does this brand operate in a regulated or claims-sensitive category?",
      options: ["Yes — regulated or claims-sensitive", "No", "Unsure — require extra review"],
    });
  }

  input.result.conflicts.forEach((conflict) => {
    add({
      field: conflict.field,
      severity: "blocking",
      resolution: "choose-conflict",
      reason: `Authoritative sources disagree about ${conflict.field}.`,
      affects: [conflict.field],
      canResearch: false,
      question: conflict.question,
      options: conflict.options.map((option) => option.value).slice(0, 8),
    });
  });

  const catalogueReports = input.reports.filter((report) =>
    report.label.toLowerCase().includes("catalogue"),
  );
  const catalogueWarnings = catalogueReports.flatMap((report) => report.warnings);
  const productsMissingPrices = input.productCatalogues.reduce(
    (count, catalogue) =>
      count + catalogue.products.filter((product) => product.price === null).length,
    0,
  );
  if (
    catalogueReports.some((report) => report.status === "failed") ||
    catalogueWarnings.some((warning) => /price column|product name/i.test(warning)) ||
    productsMissingPrices > 0
  ) {
    add({
      field: "kernel.productCatalogues",
      severity: "blocking",
      resolution: "upload-catalogue",
      reason: productsMissingPrices > 0
        ? `${productsMissingPrices} catalogue product${productsMissingPrices === 1 ? " is" : "s are"} missing a listed price.`
        : catalogueWarnings[0] ?? "The product catalogue could not be read reliably.",
      affects: ["product copy", "pricing claims", "offers"],
      canResearch: false,
      question: "Please upload a corrected .xlsx catalogue with Product Name and Price columns.",
      options: [],
    });
  }

  input.result.missingInformation.forEach((missing, index) => {
    const field = `missing.${missing
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 140) || index + 1}`;
    add({
      field,
      severity: "optional",
      resolution: "ask-user",
      reason: missing,
      affects: [],
      canResearch: false,
      question: `Can you confirm this missing brand information: ${missing.replace(/[?.!]+$/, "")}?`,
      options: [],
    });
  });

  const severityOrder = { blocking: 0, review: 1, optional: 2 } as const;
  return requests
    .sort((left, right) => severityOrder[left.severity] - severityOrder[right.severity])
    .slice(0, 50)
    .map((request, index) => ({
      id: requestId(index, request.field),
      ...request,
    }));
}
