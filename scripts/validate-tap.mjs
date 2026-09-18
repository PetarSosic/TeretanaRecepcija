/** Fail closed on an empty/incomplete TAP run or any failed assertion. */
export function validateTap(chunks) {
  const lines = chunks.flatMap((text) => text.split(/\r?\n/));
  const plans = lines.filter((line) => /^1\.\.\d+\s*$/.test(line));
  const assertions = lines.filter((line) => /^ok\s+\d+(?:\s|$)/.test(line));
  const expected = plans.length === 1 ? Number(plans[0].slice(3)) : 0;
  const hasFailure = lines.some((line) =>
    /^(?:not ok\b|Bail out!|# Looks like)/.test(line),
  );
  const sequential = assertions.every(
    (line, index) => Number(/^ok\s+(\d+)/.exec(line)[1]) === index + 1,
  );
  return {
    ok:
      expected > 0 &&
      assertions.length === expected &&
      sequential &&
      !hasFailure,
    count: assertions.length,
  };
}
