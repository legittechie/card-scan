/**
 * Business Card Scanner — GenAIScript reference
 * https://microsoft.github.io/genaiscript/guides/business-card-scanner/
 *
 * Usage:
 *   npx genaiscript run scripts/scan-business-card.genai.mjs <image.jpg>
 */
script({
  description:
    "Extract business card fields including Others for miscellaneous text.",
  group: "vision",
  model: "openai:gpt-4o",
  maxTokens: 4000,
});

defImages(env.files);

const schema = defSchema("BUSINESS_CARD", {
  type: "array",
  items: {
    type: "object",
    properties: {
      Name: { type: "string" },
      Company: { type: "string" },
      Title: { type: "string" },
      Phone: { type: "string" },
      Email: { type: "string" },
      Website: { type: "string" },
      Address: { type: "string" },
      BusinessCategory: { type: "string" },
      Others: {
        type: "string",
        description: "Any other text on the card not captured above",
      },
    },
    required: ["Name", "Company", "Title", "Phone", "Email"],
  },
});

const outputName = path.join(
  path.dirname(env.files[0].filename),
  "card.csv"
);

$`Extract business card fields per ${schema}. Put extra text in Others.
Write CSV to ${outputName}.`;
