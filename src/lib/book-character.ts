const characterTraits = [
  ["early twenties", "late twenties", "early thirties", "late thirties", "forties", "early fifties", "late fifties", "early sixties"],
  ["warm beige", "cool beige", "golden tan", "light olive", "medium olive", "copper brown", "warm deep brown", "cool deep brown"],
  ["long layered hair", "close-cropped curls", "short wavy hair", "a shoulder-length blunt cut", "a textured pixie cut", "tightly curled hair in a bun", "a side-parted bob", "neatly swept-back hair"],
  ["oval", "square", "round", "heart-shaped", "oblong", "diamond-shaped", "softly rectangular", "angular"],
  ["thick straight eyebrows", "a broad nose with a rounded tip", "arched eyebrows", "a small beauty mark by one cheek", "a prominent chin", "a gently curved nose", "high cheekbones", "a lightly freckled nose"],
  ["thin round glasses", "a dark denim overshirt", "a soft blue cardigan", "a rust-colored collar", "small silver studs", "a striped knit top", "a forest-green jacket", "a watch with a tan strap"],
] as const;

// The product UUID supplies stable, independent choices without saving or generating a new profile on retries.
export function bookCharacterDescription(productId: string): string {
  const [age, skin, hair, face, feature, detail] = characterTraits.map(
    (options, index) => options[Number.parseInt(productId[index]!, 16) % options.length],
  );
  return `A person in their ${age}, with ${skin} skin, ${hair}, a ${face} face, ${feature}, and ${detail} when appropriate to the scene.`;
}

export function bookCharacterDirection(productId: string, hasReference: boolean): string {
  return [
    "Only show a person when the scene calls for one. If the book's recurring character appears, use the identity below. Give any supporting people distinct faces.",
    ...(hasReference ? ["If the attached artwork clearly shows the recurring character, preserve that person's recognizable face, skin tone, hair, and age. Follow the new composition and ignore any lettering. If it has no character, use the description below."] : []),
    `Recurring character: ${bookCharacterDescription(productId)}`,
  ].join(" ");
}
