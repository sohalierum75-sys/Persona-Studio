// ============================================================
// Shared state for the Target Generator selector.
//
// The active generator is remembered across sessions
// ("ps_prompt_engine"); each generator keeps its own options
// blob ("ps_gen_opts:<id>"), so switching Veo → Flux → Veo
// restores the previous Veo options. Used by both the studio
// prompt panel and the extension side panel — they share the
// same extension-origin localStorage.
// ============================================================
import { useCallback, useMemo, useState } from "react";
import {
  getGenerator, readGeneratorOptions, readSavedGenerator,
  saveGenerator, saveGeneratorOptions,
} from "../utils/generators";
import type { GeneratorDef, GeneratorId, GeneratorOptions } from "../utils/generators";

export interface GeneratorSelection {
  generatorId: GeneratorId;
  generator: GeneratorDef;
  options: GeneratorOptions;
  selectGenerator: (id: GeneratorId) => void;
  updateOptions: (patch: GeneratorOptions) => void;
}

export function useGeneratorSelection(): GeneratorSelection {
  const initial = useMemo(() => {
    const id = readSavedGenerator();
    return { id, options: readGeneratorOptions(id) };
  }, []);

  const [generatorId, setGeneratorId] = useState<GeneratorId>(initial.id);
  const [options, setOptions] = useState<GeneratorOptions>(initial.options);

  const selectGenerator = useCallback((id: GeneratorId) => {
    setGeneratorId(id);
    setOptions(readGeneratorOptions(id));
    saveGenerator(id);
  }, []);

  const updateOptions = useCallback((patch: GeneratorOptions) => {
    const next = { ...options, ...patch };
    setOptions(next);
    saveGeneratorOptions(generatorId, next);
  }, [options, generatorId]);

  return {
    generatorId,
    generator: getGenerator(generatorId),
    options,
    selectGenerator,
    updateOptions,
  };
}
