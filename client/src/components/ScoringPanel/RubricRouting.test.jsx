import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ScoringPanel from "./ScoringPanel";
import { DEFAULT_RUBRIC_CONFIG, RUBRIC_YEAR_KEYS, getRubricForYear } from "../../utils/rubric";

afterEach(cleanup);

const ROUTES = [
  { year: "Freshman", label: "Freshman", image: "/rubrics/FreshmanRubric.png", categories: 2 },
  { year: "Sophomore", label: "Sophomore", image: "/rubrics/SophomoreRubric.png", categories: 3 },
  { year: "Junior Transfer", label: "Junior Transfer", image: "/rubrics/OthersRubric.png", categories: 2 },
];

describe("resume rubric routing", () => {
  for (const route of ROUTES) {
    it(`renders the ${route.label} rubric for ${route.year}`, () => {
      const rubric = getRubricForYear(DEFAULT_RUBRIC_CONFIG, route.year);
      render(
        <ScoringPanel
          rubric={rubric}
          scores={{}}
          onScore={vi.fn()}
          notes=""
          onNotes={vi.fn()}
          onAction={vi.fn()}
        />
      );

      const image = screen.getByRole("img", { name: `${route.label} scoring rubric` });
      expect(image.getAttribute("src")).toBe(route.image);
      expect(rubric.metrics).toHaveLength(route.categories);
    });
  }

  it("only exposes eligible year groups in the rubric editor", () => {
    expect(RUBRIC_YEAR_KEYS.map(({ key }) => key)).toEqual(["freshman", "sophomore", "juniortransfer"]);
  });

  it("corrects the legacy Junior & Senior label on existing Junior Transfer configs", () => {
    const legacy = structuredClone(DEFAULT_RUBRIC_CONFIG);
    legacy.byYear.juniortransfer.label = "Junior & Senior";
    expect(getRubricForYear(legacy, "Junior Transfer").label).toBe("Junior Transfer");
  });
});
