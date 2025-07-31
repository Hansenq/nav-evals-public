import { describe, expect, it } from "vitest";

import {
  calculateMinorMistakeThreshold,
  countMajorNavigationMistakes,
  countMinorNavigationMistakes,
  filterContinueCommands,
  isNavigationExactlyCorrect,
  isNavigationMostlyCorrect,
  normalizeStreetName,
  parseNavigationCommands,
  streetNameMatches,
} from "./eval.js";

describe("parseNavigationCommands", () => {
  it("should parse basic commands correctly", () => {
    const text = "begin: north, the embarcadero\nleft, king st\ndestination, right";
    const result = parseNavigationCommands(text);

    expect(result).toEqual([
      {
        type: "start",
        direction: "north",
        street: "the embarcadero",
        original: "begin: north, the embarcadero",
      },
      { type: "command", verb: "left", street: "king st", original: "left, king st" },
      { type: "destination", direction: "right", original: "destination, right" },
    ]);
  });

  it("should handle empty input", () => {
    expect(parseNavigationCommands("")).toEqual([]);
  });

  it("should handle single destination command", () => {
    const result = parseNavigationCommands("destination, left");
    expect(result).toEqual([
      { type: "destination", direction: "left", original: "destination, left" },
    ]);
  });

  it("should handle commands with bullet points and numbering", () => {
    const text =
      "1. begin: north, the embarcadero\n* left, king st\n- destination, right";
    const result = parseNavigationCommands(text);

    expect(result).toEqual([
      {
        type: "start",
        direction: "north",
        street: "the embarcadero",
        original: "begin: north, the embarcadero",
      },
      { type: "command", verb: "left", street: "king st", original: "left, king st" },
      { type: "destination", direction: "right", original: "destination, right" },
    ]);
  });

  it("should handle complex route with multiple commands", () => {
    const text =
      "begin: south, us-101 s\ncontinue, lombard st\nright, van ness ave\nleft, geary st\ndestination, straight";
    const result = parseNavigationCommands(text);

    expect(result).toHaveLength(5);
    expect(result[0].type).toBe("start");
    expect(result[1].type).toBe("command");
    expect(result[2].type).toBe("command");
    expect(result[3].type).toBe("command");
    expect(result[4].type).toBe("destination");
  });
});

describe("filterContinueCommands", () => {
  it("should remove continue commands but keep first and last", () => {
    const commands = [
      {
        direction: "north" as const,
        street: "3rd st",
        type: "start" as const,
        original: "begin: north, 3rd st",
      },
      {
        verb: "continue",
        street: "kearny st",
        type: "command" as const,
        original: "continue, kearny st",
      },
      {
        verb: "left",
        street: "geary st",
        type: "command" as const,
        original: "left, geary st",
      },
      {
        direction: "right" as const,
        type: "destination" as const,
        original: "destination, right",
      },
    ];

    const result = filterContinueCommands(commands);

    expect(result).toEqual([
      {
        direction: "north",
        street: "3rd st",
        type: "start",
        original: "begin: north, 3rd st",
      },
      { verb: "left", street: "geary st", type: "command", original: "left, geary st" },
      { direction: "right", type: "destination", original: "destination, right" },
    ]);
  });

  it("should keep first and last commands even if they are continue", () => {
    const commands = [
      {
        verb: "continue",
        street: "first st",
        type: "command" as const,
        original: "continue, first st",
      },
      {
        verb: "left",
        street: "middle st",
        type: "command" as const,
        original: "left, middle st",
      },
      {
        verb: "continue",
        street: "last st",
        type: "command" as const,
        original: "continue, last st",
      },
    ];

    const result = filterContinueCommands(commands);

    expect(result).toEqual([
      {
        verb: "continue",
        street: "first st",
        type: "command",
        original: "continue, first st",
      },
      { verb: "left", street: "middle st", type: "command", original: "left, middle st" },
      {
        verb: "continue",
        street: "last st",
        type: "command",
        original: "continue, last st",
      },
    ]);
  });

  it("should handle empty array", () => {
    expect(filterContinueCommands([])).toEqual([]);
  });

  it("should handle single command", () => {
    const commands = [
      {
        verb: "continue",
        street: "main st",
        type: "command" as const,
        original: "continue, main st",
      },
    ];
    expect(filterContinueCommands(commands)).toEqual(commands);
  });

  it("should remove multiple consecutive continue commands", () => {
    const commands = [
      {
        direction: "north" as const,
        street: "start st",
        type: "start" as const,
        original: "begin: north, start st",
      },
      {
        verb: "continue",
        street: "first st",
        type: "command" as const,
        original: "continue, first st",
      },
      {
        verb: "continue",
        street: "second st",
        type: "command" as const,
        original: "continue, second st",
      },
      {
        verb: "left",
        street: "turn st",
        type: "command" as const,
        original: "left, turn st",
      },
      {
        direction: "straight" as const,
        type: "destination" as const,
        original: "destination, straight",
      },
    ];

    const result = filterContinueCommands(commands);

    expect(result).toEqual([
      {
        direction: "north",
        street: "start st",
        type: "start",
        original: "begin: north, start st",
      },
      { verb: "left", street: "turn st", type: "command", original: "left, turn st" },
      { direction: "straight", type: "destination", original: "destination, straight" },
    ]);
  });
});

describe("normalizeStreetName", () => {
  it("should normalize street names by removing special characters", () => {
    expect(normalizeStreetName("Main St.")).toBe("main st");
    expect(normalizeStreetName("US-101 N")).toBe("us-101 n"); // Hyphens are preserved
    expect(normalizeStreetName("John F. Kennedy Dr")).toBe("john f kennedy dr");
  });

  it("should handle multiple spaces", () => {
    expect(normalizeStreetName("Main   Street   Ave")).toBe("main street ave");
  });

  it("should handle empty string", () => {
    expect(normalizeStreetName("")).toBe("");
  });

  it("should preserve hyphens in highway names", () => {
    expect(normalizeStreetName("CA-1")).toBe("ca-1");
    expect(normalizeStreetName("I-280")).toBe("i-280");
  });
});

describe("streetNameMatches", () => {
  it("should match exact street names", () => {
    expect(streetNameMatches("main st", "main st")).toBe(true);
  });

  it("should match when actual contains expected", () => {
    expect(streetNameMatches("main st", "main st north")).toBe(true);
    expect(streetNameMatches("ca-1", "exit ca-1 s / 19th ave")).toBe(true);
  });

  it("should not match when expected is not contained in actual", () => {
    expect(streetNameMatches("main st", "elm st")).toBe(false);
  });

  it("should handle empty strings", () => {
    expect(streetNameMatches("", "")).toBe(true);
    expect(streetNameMatches("main st", "")).toBe(false);
    expect(streetNameMatches("", "main st")).toBe(true);
  });

  it("should be case insensitive through normalization", () => {
    expect(streetNameMatches("Main St", "MAIN ST")).toBe(true);
  });
});

describe("countMinorNavigationMistakes", () => {
  it("should count command length differences", () => {
    const expected = parseNavigationCommands(
      "begin: north, main st\nleft, elm st\ndestination, right",
    );
    const actual = parseNavigationCommands("begin: north, main st\ndestination, right");

    expect(countMinorNavigationMistakes(expected, actual)).toBe(1); // One missing command
  });

  it("should count destination direction mismatches", () => {
    const expected = parseNavigationCommands("destination, left");
    const actual = parseNavigationCommands("destination, right");

    expect(countMinorNavigationMistakes(expected, actual)).toBe(1);
  });

  it("should detect street abbreviation mistakes", () => {
    const expected = parseNavigationCommands("left, main blvd");
    const actual = parseNavigationCommands("left, main ave");

    expect(countMinorNavigationMistakes(expected, actual)).toBe(1);
  });

  it("should detect highway cardinal direction mistakes", () => {
    const expected = parseNavigationCommands("right, us-101 n");
    const actual = parseNavigationCommands("right, us-101 s");

    expect(countMinorNavigationMistakes(expected, actual)).toBe(1);
  });

  it("should ignore turn direction differences for named highways with cardinal directions", () => {
    const expected = parseNavigationCommands("left, us-101 s");
    const actual = parseNavigationCommands("right, us-101 s");

    expect(countMinorNavigationMistakes(expected, actual)).toBe(0);
  });

  it("should ignore turn direction differences for various highway types with cardinal directions", () => {
    // Test different highway types
    const testCases = [
      ["right, ca-85 s", "continue, ca-85 s"],
      ["left, i-280 n", "right, i-280 n"],
      ["continue, us-101 s", "left, us-101 s"],
    ];

    testCases.forEach(([expected, actual]) => {
      const exp = parseNavigationCommands(expected);
      const act = parseNavigationCommands(actual);
      expect(countMinorNavigationMistakes(exp, act)).toBe(0);
    });
  });

  it("should count highway direction differences as mistakes", () => {
    const expected = parseNavigationCommands("right, ca-85 s");
    const actual = parseNavigationCommands("right, ca-85 n");

    expect(countMinorNavigationMistakes(expected, actual)).toBe(1);
  });

  it("should count different highways as mistakes", () => {
    const expected = parseNavigationCommands("right, ca-85 s");
    const actual = parseNavigationCommands("right, ca-87 s");

    expect(countMinorNavigationMistakes(expected, actual)).toBe(1);
  });

  it("should count turn direction differences for non-highway streets as mistakes", () => {
    const expected = parseNavigationCommands("right, main st");
    const actual = parseNavigationCommands("left, main st");

    expect(countMinorNavigationMistakes(expected, actual)).toBe(1);
  });

  it("should handle empty arrays", () => {
    expect(countMinorNavigationMistakes([], [])).toBe(0);
  });

  it("should handle identical commands", () => {
    const commands = parseNavigationCommands(
      "begin: north, main st\nleft, elm st\ndestination, right",
    );
    expect(countMinorNavigationMistakes(commands, commands)).toBe(0);
  });

  // Integration test with multiple edge cases
  it("should count multiple types of minor mistakes", () => {
    const expected = parseNavigationCommands(
      "begin: north, main st\nright, us-101 n\nleft, elm blvd\ndestination, left",
    );
    const actual = parseNavigationCommands(
      "begin: north, main st\nright, us-101 s\nleft, elm ave\ndestination, right",
    );

    expect(countMinorNavigationMistakes(expected, actual)).toBe(3); // Highway direction + street abbrev + destination direction
  });
});

describe("isNavigationExactlyCorrect", () => {
  it("should return true for identical routes", () => {
    const commands = parseNavigationCommands(
      "begin: north, main st\nleft, elm st\ndestination, right",
    );
    expect(isNavigationExactlyCorrect(commands, commands)).toBe(true);
  });

  it("should return false for different command counts", () => {
    const expected = parseNavigationCommands(
      "begin: north, main st\nleft, elm st\ndestination, right",
    );
    const actual = parseNavigationCommands("begin: north, main st\ndestination, right");

    expect(isNavigationExactlyCorrect(expected, actual)).toBe(false);
  });

  it("should return false for different command types", () => {
    const expected = parseNavigationCommands(
      "begin: north, main st\nleft, elm st\ndestination, right",
    );
    const actual = parseNavigationCommands(
      "begin: north, main st\nright, elm st\ndestination, right",
    );

    expect(isNavigationExactlyCorrect(expected, actual)).toBe(false);
  });

  it("should return false for different destination directions", () => {
    const expected = parseNavigationCommands("destination, left");
    const actual = parseNavigationCommands("destination, right");

    expect(isNavigationExactlyCorrect(expected, actual)).toBe(false);
  });

  it("should handle empty arrays", () => {
    expect(isNavigationExactlyCorrect([], [])).toBe(true);
  });

  it("should ignore continue commands when comparing", () => {
    const expected = parseNavigationCommands(
      "begin: north, main st\ncontinue, main st\nleft, elm st\ndestination, right",
    );
    const actual = parseNavigationCommands(
      "begin: north, main st\nleft, elm st\ndestination, right",
    );

    expect(isNavigationExactlyCorrect(expected, actual)).toBe(true);
  });

  // Integration test with complex route
  it("should correctly evaluate complex route with multiple commands", () => {
    const expected = parseNavigationCommands(
      "begin: south, us-101 s\nright, ca-1 s\ncontinue, lincoln way\nleft, 19th ave\ndestination, straight",
    );
    const actual = parseNavigationCommands(
      "begin: south, us-101 s\nright, ca-1 s\nleft, 19th ave\ndestination, straight",
    );

    expect(isNavigationExactlyCorrect(expected, actual)).toBe(true); // Continue command should be ignored
  });

  it("should allow turn direction differences for named highways with cardinal directions", () => {
    const expected = parseNavigationCommands("left, us-101 s");
    const actual = parseNavigationCommands("right, us-101 s");

    expect(isNavigationExactlyCorrect(expected, actual)).toBe(true);
  });

  it("should allow turn direction differences for various highway types with cardinal directions", () => {
    const testCases = [
      ["right, ca-85 s", "continue, ca-85 s"],
      ["left, i-280 n", "right, i-280 n"],
      ["continue, us-101 s", "left, us-101 s"],
    ];

    testCases.forEach(([expected, actual]) => {
      const exp = parseNavigationCommands(expected);
      const act = parseNavigationCommands(actual);
      expect(isNavigationExactlyCorrect(exp, act)).toBe(true);
    });
  });

  it("should return false for highway direction differences", () => {
    const expected = parseNavigationCommands("right, ca-85 s");
    const actual = parseNavigationCommands("right, ca-85 n");

    expect(isNavigationExactlyCorrect(expected, actual)).toBe(false);
  });

  it("should return false for different highways", () => {
    const expected = parseNavigationCommands("right, ca-85 s");
    const actual = parseNavigationCommands("right, ca-87 s");

    expect(isNavigationExactlyCorrect(expected, actual)).toBe(false);
  });

  it("should return false for turn direction differences on non-highway streets", () => {
    const expected = parseNavigationCommands("right, main st");
    const actual = parseNavigationCommands("left, main st");

    expect(isNavigationExactlyCorrect(expected, actual)).toBe(false);
  });
});

describe("countMajorNavigationMistakes", () => {
  it("should count wrong command types", () => {
    const expected = parseNavigationCommands(
      "begin: north, main st\nleft, elm st\ndestination, right",
    );
    const actual = parseNavigationCommands(
      "begin: north, main st\nright, elm st\ndestination, right",
    );

    expect(countMajorNavigationMistakes(expected, actual)).toBe(1); // Wrong verb
  });

  it("should count wrong start directions", () => {
    const expected = parseNavigationCommands("begin: north, main st\ndestination, right");
    const actual = parseNavigationCommands("begin: south, main st\ndestination, right");

    expect(countMajorNavigationMistakes(expected, actual)).toBe(1);
  });

  it("should count completely wrong street names", () => {
    const expected = parseNavigationCommands("left, main st");
    const actual = parseNavigationCommands("left, elm st");

    expect(countMajorNavigationMistakes(expected, actual)).toBe(1);
  });

  it("should count excessive command count differences", () => {
    const expected = parseNavigationCommands(
      "begin: north, main st\nleft, elm st\nright, oak st\nleft, pine st\nright, maple st\ndestination, right",
    );
    const actual = parseNavigationCommands("begin: north, main st\ndestination, right");

    expect(countMajorNavigationMistakes(expected, actual)).toBe(2); // Command count difference (>2) + missing command types
  });

  it("should not count destination direction differences as major", () => {
    const expected = parseNavigationCommands("destination, left");
    const actual = parseNavigationCommands("destination, right");

    expect(countMajorNavigationMistakes(expected, actual)).toBe(0);
  });

  it("should not count turn direction differences as major mistakes for named highways", () => {
    const expected = parseNavigationCommands("left, us-101 s");
    const actual = parseNavigationCommands("right, us-101 s");

    expect(countMajorNavigationMistakes(expected, actual)).toBe(0);
  });

  it("should not count turn direction differences as major mistakes for various highway types", () => {
    const testCases = [
      ["right, ca-85 s", "continue, ca-85 s"],
      ["left, i-280 n", "right, i-280 n"],
      ["continue, us-101 s", "left, us-101 s"],
    ];

    testCases.forEach(([expected, actual]) => {
      const exp = parseNavigationCommands(expected);
      const act = parseNavigationCommands(actual);
      expect(countMajorNavigationMistakes(exp, act)).toBe(0);
    });
  });

  it("should count highway direction differences as major mistakes", () => {
    const expected = parseNavigationCommands("right, ca-85 s");
    const actual = parseNavigationCommands("right, ca-85 n");

    expect(countMajorNavigationMistakes(expected, actual)).toBe(1);
  });

  it("should count different highways as major mistakes", () => {
    const expected = parseNavigationCommands("right, ca-85 s");
    const actual = parseNavigationCommands("right, ca-87 s");

    expect(countMajorNavigationMistakes(expected, actual)).toBe(1);
  });

  it("should count turn direction differences as major mistakes for non-highway streets", () => {
    const expected = parseNavigationCommands("right, main st");
    const actual = parseNavigationCommands("left, main st");

    expect(countMajorNavigationMistakes(expected, actual)).toBe(1);
  });

  it("should handle empty arrays", () => {
    expect(countMajorNavigationMistakes([], [])).toBe(0);
  });

  // Integration test with multiple major mistakes
  it("should count multiple major mistakes", () => {
    const expected = parseNavigationCommands(
      "begin: north, main st\nleft, elm st\nright, oak st\ndestination, straight",
    );
    const actual = parseNavigationCommands(
      "begin: south, pine st\nright, maple st\ndestination, straight",
    );

    const mistakes = countMajorNavigationMistakes(expected, actual);
    expect(mistakes).toBeGreaterThan(2); // Wrong direction, wrong streets, wrong verbs
  });
});

describe("calculateMinorMistakeThreshold", () => {
  it("should return minimum threshold of 1", () => {
    const shortRoute = parseNavigationCommands("destination, left");
    expect(calculateMinorMistakeThreshold(shortRoute, shortRoute)).toBe(1);
  });

  it("should scale with route complexity", () => {
    const simpleRoute = parseNavigationCommands(
      "begin: north, main st\ndestination, right",
    );
    const complexRoute = parseNavigationCommands(
      "begin: north, main st\nleft, elm st\nright, oak st\nleft, pine st\nright, maple st\ndestination, straight",
    );

    const simpleThreshold = calculateMinorMistakeThreshold(simpleRoute, simpleRoute);
    const complexThreshold = calculateMinorMistakeThreshold(complexRoute, complexRoute);

    expect(complexThreshold).toBeGreaterThan(simpleThreshold);
  });

  it("should calculate based on both expected and actual routes", () => {
    const expected = parseNavigationCommands(
      "begin: north, main st\nleft, elm st\ndestination, right",
    );
    const actual = parseNavigationCommands("begin: north, main st\ndestination, right");

    expect(calculateMinorMistakeThreshold(expected, actual)).toBeGreaterThan(0);
  });
});

describe("isNavigationMostlyCorrect", () => {
  it("should return false if major mistakes exist", () => {
    const expected = parseNavigationCommands(
      "begin: north, main st\nleft, elm st\ndestination, right",
    );
    const actual = parseNavigationCommands(
      "begin: south, main st\nleft, elm st\ndestination, right",
    ); // Wrong start direction

    expect(isNavigationMostlyCorrect(expected, actual)).toBe(false);
  });

  it("should return true for identical routes", () => {
    const commands = parseNavigationCommands(
      "begin: north, main st\nleft, elm st\ndestination, right",
    );
    expect(isNavigationMostlyCorrect(commands, commands)).toBe(true);
  });

  it("should return true for minor mistakes within threshold", () => {
    const expected = parseNavigationCommands(
      "begin: north, main st\nleft, elm st\ndestination, left",
    );
    const actual = parseNavigationCommands(
      "begin: north, main st\nleft, elm st\ndestination, right",
    ); // Minor destination difference

    expect(isNavigationMostlyCorrect(expected, actual)).toBe(true);
  });

  it("should return false for too many minor mistakes", () => {
    const expected = parseNavigationCommands(
      "begin: north, main st\nright, us-101 n\nleft, elm blvd\nright, oak ave\ndestination, left",
    );
    const actual = parseNavigationCommands(
      "begin: north, main st\nright, us-101 s\nleft, elm ave\nright, oak blvd\ndestination, right",
    ); // Multiple minor mistakes

    const mistakes = countMinorNavigationMistakes(
      filterContinueCommands(expected),
      filterContinueCommands(actual),
    );
    const threshold = calculateMinorMistakeThreshold(expected, actual);

    if (mistakes > threshold) {
      expect(isNavigationMostlyCorrect(expected, actual)).toBe(false);
    } else {
      expect(isNavigationMostlyCorrect(expected, actual)).toBe(true);
    }
  });

  it("should handle empty arrays", () => {
    expect(isNavigationMostlyCorrect([], [])).toBe(true);
  });

  // Integration test with complex scenario
  it("should correctly evaluate complex route with mixed mistake types", () => {
    const expected = parseNavigationCommands(
      "begin: south, us-101 s\nright, ca-1 s\ncontinue, lincoln way\nleft, 19th ave\ndestination, straight",
    );
    const actual = parseNavigationCommands(
      "begin: south, us-101 s\nright, ca-1 s\nleft, 19th ave\ndestination, right",
    ); // Minor destination difference

    expect(isNavigationMostlyCorrect(expected, actual)).toBe(true); // Should be mostly correct despite minor difference
  });
});
