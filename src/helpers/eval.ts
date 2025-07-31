// Navigation evaluation helpers with improved type safety and naming

export type StartDirection = "north" | "south" | "east" | "west";
export type DestinationDirection = "left" | "right" | "straight";

export type ParsedCommand =
  | {
      type: "start";
      direction: StartDirection;
      street: string;
      original: string;
    }
  | {
      type: "command";
      verb: string;
      street: string;
      original: string;
    }
  | {
      type: "destination";
      direction: DestinationDirection;
      original: string;
    };

/**
 * Parses navigation commands from text into structured format
 * @param text Raw navigation text with commands separated by newlines
 * @returns Array of parsed navigation commands
 */
export function parseNavigationCommands(text: string): ParsedCommand[] {
  const lines = text
    .toLowerCase()
    .split("\n")
    .map((l) =>
      l
        .replace(/^[*\-\d\.\s]+/, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);

  return lines.map((cmd, index) => {
    const [verb, ...streetParts] = cmd.split(",").map((s) => s.trim());
    const street = streetParts.join(",").trim();

    // Handle the first command as a start command
    if (index === 0 && verb.startsWith("begin:")) {
      const directionAndStreet = verb.replace("begin:", "").trim() + ", " + street;
      const parts = directionAndStreet.split(",").map((s) => s.trim());
      const direction = parts[0] as StartDirection;
      const actualStreet = parts.slice(1).join(",").trim();

      return {
        type: "start" as const,
        direction: direction,
        street: actualStreet,
        original: cmd,
      };
    }

    // Handle the last command as a destination command
    if (index === lines.length - 1 && verb === "destination") {
      const direction = street as DestinationDirection;

      return {
        type: "destination" as const,
        direction: direction,
        original: cmd,
      };
    }

    return {
      type: "command" as const,
      verb: verb || "",
      street: street,
      original: cmd,
    };
  });
}

/**
 * Removes continue commands from the middle of a route while preserving first and last commands
 * Exception: Keep continue commands for named highways with cardinal directions since they
 * should be treated equivalently to other turn directions
 * @param commands Array of parsed navigation commands
 * @returns Filtered array with continue commands removed (except first/last and highways)
 */
export function filterContinueCommands(commands: ParsedCommand[]): ParsedCommand[] {
  const result: ParsedCommand[] = [];

  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i];

    // Always keep first and last commands
    if (i === 0 || i === commands.length - 1) {
      result.push(cmd);
      continue;
    }

    // Skip continue commands EXCEPT for named highways with cardinal directions
    if (cmd.type === "command" && cmd.verb === "continue") {
      // Keep continue commands for named highways with cardinal directions
      if (isNamedHighwayWithCardinalDirection(cmd.street)) {
        result.push(cmd);
      }
      // Skip other continue commands
      continue;
    }

    result.push(cmd);
  }

  return result;
}

/**
 * Normalizes street names by removing special characters and standardizing format
 * @param street Raw street name
 * @returns Normalized street name in lowercase with consistent spacing
 */
export function normalizeStreetName(street: string): string {
  return street
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Checks if a street is a named highway with a cardinal direction
 * @param street Street name to check
 * @returns True if street is a named highway with cardinal direction (e.g., US-101 S, I-280 N)
 */
export function isNamedHighwayWithCardinalDirection(street: string): boolean {
  const normalized = normalizeStreetName(street);
  const isHighway = /\b(us|i|ca)-?\d+\b/.test(normalized);
  const hasCardinalDirection = /\b[nsew]\b/.test(normalized);
  return isHighway && hasCardinalDirection;
}

/**
 * Checks if the actual street name contains the expected street name
 * @param expected Expected street name
 * @param actual Actual street name from navigation output
 * @returns True if actual contains expected (case-insensitive)
 */
export function streetNameMatches(expected: string, actual: string): boolean {
  const expNorm = normalizeStreetName(expected);
  const actNorm = normalizeStreetName(actual);

  if (expNorm === actNorm) return true;

  return actNorm.includes(expNorm);
}

/**
 * Counts minor navigation mistakes between expected and actual routes
 * @param expected Expected navigation commands
 * @param actual Actual navigation commands from LLM
 * @returns Number of minor mistakes found
 */
export function countMinorNavigationMistakes(
  expected: ParsedCommand[],
  actual: ParsedCommand[],
): number {
  let mistakes = 0;

  // Count difference in number of commands
  mistakes += Math.abs(actual.length - expected.length);

  const minLength = Math.min(expected.length, actual.length);

  for (let i = 0; i < minLength; i++) {
    const exp = expected[i];
    const act = actual[i];

    // Check destination direction mismatch
    if (exp.type === "destination" && act.type === "destination") {
      if (exp.direction !== act.direction) {
        mistakes++;
      }
      continue;
    }

    // Helper function to check street abbreviation mistakes
    const hasStreetAbbreviationMistake = (
      expStreet: string,
      actStreet: string,
    ): boolean => {
      const expNorm = normalizeStreetName(expStreet);
      const actNorm = normalizeStreetName(actStreet);

      const expWords = expNorm.split(" ");
      const actWords = actNorm.split(" ");

      if (expWords.length === actWords.length) {
        for (let j = 0; j < expWords.length; j++) {
          const expWord = expWords[j];
          const actWord = actWords[j];

          // Check common abbreviation mismatches
          if (
            (expWord === "blvd" && actWord === "ave") ||
            (expWord === "ave" && actWord === "blvd") ||
            (expWord === "st" && actWord === "ave") ||
            (expWord === "ave" && actWord === "st") ||
            (expWord === "st" && actWord === "blvd") ||
            (expWord === "blvd" && actWord === "st")
          ) {
            return true;
          }
        }
      }
      return false;
    };

    // Helper function to check highway direction mistakes
    const hasHighwayDirectionMistake = (
      expStreet: string,
      actStreet: string,
    ): boolean => {
      const expNorm = normalizeStreetName(expStreet);
      const actNorm = normalizeStreetName(actStreet);

      // Check if both are highways (contain numbers and direction indicators)
      const isHighway = (street: string) =>
        /\b(us|i|ca|or|ut|nv|az|wa|id|mt|co|nm|tx|ny|nj|pa|ma|ct|rh|nh|vt)-?\d+\b/.test(
          street,
        );

      if (isHighway(expNorm) && isHighway(actNorm)) {
        // Extract base highway name (without direction)
        const getHighwayBase = (street: string) =>
          street.replace(/\b[nsew]\b/g, "").trim();

        if (getHighwayBase(expNorm) === getHighwayBase(actNorm)) {
          // Same highway, check if directions differ
          const hasDirection = (street: string) => /\b[nsew]\b/.test(street);
          if (hasDirection(expNorm) && hasDirection(actNorm)) {
            return expNorm !== actNorm;
          }
        }
      }
      return false;
    };

    // Check for street-related minor mistakes
    if (exp.type === "command" && act.type === "command") {
      // For highway commands with matching streets, don't count verb differences as mistakes
      const isHighwayCommand =
        isNamedHighwayWithCardinalDirection(exp.street) &&
        isNamedHighwayWithCardinalDirection(act.street);

      if (exp.verb === act.verb) {
        // Same verb, check for street mistakes
        if (hasStreetAbbreviationMistake(exp.street, act.street)) {
          mistakes++;
        } else if (hasHighwayDirectionMistake(exp.street, act.street)) {
          mistakes++;
        } else if (isHighwayCommand && !streetNameMatches(exp.street, act.street)) {
          // Different highway names (e.g., ca-85 vs ca-87) should be counted as mistakes
          mistakes++;
        } else if (!streetNameMatches(exp.street, act.street)) {
          // Different street names for non-highways
          mistakes++;
        }
      } else if (!isHighwayCommand || !streetNameMatches(exp.street, act.street)) {
        // Different verb is only a mistake if it's not a highway command with matching streets
        // This handles cases where verb differs but it's not a highway, or highway names don't match
        mistakes++;
      }
    }
  }

  return mistakes;
}

/**
 * Evaluates if navigation is exactly correct (no differences allowed)
 * @param expected Expected navigation commands
 * @param actual Actual navigation commands from LLM
 * @returns True if routes match exactly after filtering continue commands
 */
export function isNavigationExactlyCorrect(
  expected: ParsedCommand[],
  actual: ParsedCommand[],
): boolean {
  // Remove continue commands for both
  const expFiltered = filterContinueCommands(expected);
  const actFiltered = filterContinueCommands(actual);

  // Must have same number of commands
  if (expFiltered.length !== actFiltered.length) {
    return false;
  }

  // Check each command
  for (let i = 0; i < expFiltered.length; i++) {
    const exp = expFiltered[i];
    const act = actFiltered[i];

    // Types must match
    if (exp.type !== act.type) {
      return false;
    }

    // Handle each type appropriately
    if (exp.type === "start" && act.type === "start") {
      // For start commands, direction and street must match
      if (exp.direction !== act.direction || !streetNameMatches(exp.street, act.street)) {
        return false;
      }
    } else if (exp.type === "command" && act.type === "command") {
      // For regular commands, verb must match and street must be contained
      // Exception: For named highways with cardinal directions, ignore turn direction differences
      const isHighwayCommand =
        isNamedHighwayWithCardinalDirection(exp.street) &&
        isNamedHighwayWithCardinalDirection(act.street);

      const verbMatches =
        exp.verb === act.verb ||
        (isHighwayCommand && streetNameMatches(exp.street, act.street));

      if (!verbMatches || !streetNameMatches(exp.street, act.street)) {
        return false;
      }
    } else if (exp.type === "destination" && act.type === "destination") {
      // For destination commands, direction must match exactly
      if (exp.direction !== act.direction) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Counts major navigation mistakes that make directions fundamentally wrong
 * @param expected Expected navigation commands
 * @param actual Actual navigation commands from LLM
 * @returns Number of major mistakes found
 */
export function countMajorNavigationMistakes(
  expected: ParsedCommand[],
  actual: ParsedCommand[],
): number {
  // Remove continue commands for both
  const expFiltered = filterContinueCommands(expected);
  const actFiltered = filterContinueCommands(actual);

  let majorMistakes = 0;
  const minLength = Math.min(expFiltered.length, actFiltered.length);

  for (let i = 0; i < minLength; i++) {
    const exp = expFiltered[i];
    const act = actFiltered[i];

    // Major mistake: Wrong type or wrong verb/direction
    if (exp.type !== act.type) {
      majorMistakes++;
      continue;
    }

    if (exp.type === "command" && act.type === "command") {
      // Major mistake: Wrong verb (turn direction)
      // Exception: For named highways with cardinal directions, ignore turn direction differences
      const isHighwayCommand =
        isNamedHighwayWithCardinalDirection(exp.street) &&
        isNamedHighwayWithCardinalDirection(act.street);

      const hasVerbMistake =
        exp.verb !== act.verb &&
        !(isHighwayCommand && streetNameMatches(exp.street, act.street));

      if (hasVerbMistake) {
        majorMistakes++;
      }
      // Major mistake: Completely wrong street name
      if (!streetNameMatches(exp.street, act.street)) {
        majorMistakes++;
      }
    } else if (exp.type === "start" && act.type === "start") {
      // Major mistake: Wrong direction for start command
      if (exp.direction !== act.direction) {
        majorMistakes++;
      }
      // Major mistake: Completely wrong street name
      if (!streetNameMatches(exp.street, act.street)) {
        majorMistakes++;
      }
    } else if (exp.type === "destination" && act.type === "destination") {
      // For destinations, direction differences are handled as minor mistakes in countMinorMistakes
      // No major mistakes for destination direction differences
    }
  }

  // Major mistake: Too many missing/extra commands (more than 2)
  if (Math.abs(expFiltered.length - actFiltered.length) > 2) {
    majorMistakes++;
  }

  return majorMistakes;
}

/**
 * Checks if navigation has any major mistakes
 * @param expected Expected navigation commands
 * @param actual Actual navigation commands from LLM
 * @returns True if any major mistakes are found
 */
export function hasAnyMajorMistakes(
  expected: ParsedCommand[],
  actual: ParsedCommand[],
): boolean {
  return countMajorNavigationMistakes(expected, actual) > 0;
}

/**
 * Calculates the threshold for acceptable minor mistakes based on route complexity
 * @param expected Expected navigation commands
 * @param actual Actual navigation commands from LLM
 * @returns Maximum number of minor mistakes allowed (minimum 1)
 */
export function calculateMinorMistakeThreshold(
  expected: ParsedCommand[],
  actual: ParsedCommand[],
): number {
  const expFiltered = filterContinueCommands(expected);
  const actFiltered = filterContinueCommands(actual);

  // Calculate total possible mistakes as a rough estimate:
  // - Command count differences (max of either length)
  // - Each command could have verb mismatch, street mismatch, direction mismatch
  // - Destination direction mismatch
  const maxLength = Math.max(expFiltered.length, actFiltered.length);
  const totalPossibleMistakes = maxLength + maxLength * 2 + 1; // Conservative estimate

  // Accept if mistakes are <= 10% of total possible mistakes
  return Math.max(1, Math.ceil(totalPossibleMistakes * 0.1));
}

/**
 * Evaluates if navigation is mostly correct (allows minor mistakes within threshold)
 * @param expected Expected navigation commands
 * @param actual Actual navigation commands from LLM
 * @returns True if navigation is mostly correct (no major mistakes, minor mistakes within threshold)
 */
export function isNavigationMostlyCorrect(
  expected: ParsedCommand[],
  actual: ParsedCommand[],
): boolean {
  // First check for major mistakes - if found, fail immediately
  if (hasAnyMajorMistakes(expected, actual)) {
    return false;
  }

  // Remove continue commands for both
  const expFiltered = filterContinueCommands(expected);
  const actFiltered = filterContinueCommands(actual);

  const mistakes = countMinorNavigationMistakes(expFiltered, actFiltered);
  const threshold = calculateMinorMistakeThreshold(expected, actual);

  return mistakes <= threshold;
}
