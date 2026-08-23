import { describe, expect, it } from "vitest";
import { buildSystemPrompt, buildUserPrompt } from "../prompt";

describe("CMO prompts", () => {
  it("includes brand context and delimits user input", () => {
    expect(
      buildSystemPrompt({ name: "Northwind", positioning: "Shared memory" }),
    ).toContain("Shared memory");
    expect(buildUserPrompt("Write a launch post")).toContain(
      "<user_request>Write a launch post</user_request>",
    );
  });
});
