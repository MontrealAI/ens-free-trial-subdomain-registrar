type ParentInputEthers = {
  isHexString: (value: string, length?: number | boolean) => boolean;
  namehash: (name: string) => string;
};

export function resolveParentNodeInput(
  ethersLib: ParentInputEthers,
  parentNodeInput?: string,
  parentNameInput?: string
): { parentNode: string; normalizedParentName?: string } {
  const parentNode = parentNodeInput?.trim();
  const parentName = parentNameInput?.trim();

  if (parentNode) {
    if (!ethersLib.isHexString(parentNode, 32)) {
      throw new Error("PARENT_NODE / --parent-node must be a 32-byte hex value.");
    }

    if (parentName) {
      const derived = ethersLib.namehash(parentName);
      if (derived.toLowerCase() !== parentNode.toLowerCase()) {
        throw new Error(
          `Provided parent inputs disagree: --parent-name/PARENT_NAME resolves to ${derived}, but --parent-node/PARENT_NODE is ${parentNode}. Provide one input source, or make them match exactly.`
        );
      }
      return { parentNode, normalizedParentName: parentName };
    }

    return { parentNode };
  }

  if (parentName) {
    return { parentNode: ethersLib.namehash(parentName), normalizedParentName: parentName };
  }

  throw new Error("Provide --parent-name, --parent-node, PARENT_NAME, or PARENT_NODE.");
}
