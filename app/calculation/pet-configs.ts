import {LEVEL_MODS,type DamageFormulaOverrides} from "./damage-formula";

export type PetCorrectionKind="pet"|"clone"|"ground-effect";
export type PetCorrectionApplicability="damage"|"healing";
export type PetCorrectionProfile={
  id:string;job:string;nameJa:string;nameEn:string;kind:PetCorrectionKind;
  numerator:number;denominator:number;applicability:PetCorrectionApplicability;
  traitOverride?:number;hiddenTraitMultiplier?:number;useNonTankAttack?:boolean;allowedActionIds?:number[];
  provisional?:boolean;sourceEra:"6.x+ post-squish";
};

export const POST_SQUISH_MODIFIER_BASE=80;

// The linked Allagan Studies measurements are from 5.x. These profiles use
// post-stat-squish ratios supplied for the current simulator instead of copying
// the old 100-based values. Historical 100/115 profiles become 80/90;
// Living Shadow remains provisional.
export const PET_CORRECTION_HISTORICAL_SOURCE_URL="https://www.akhmorning.com/allagan-studies/how-to-be-a-math-wizard/shadowbringers/pets-and-misc-info/";
export const PET_CORRECTION_PROFILES:Record<string,PetCorrectionProfile>={
  DRK:{id:"living-shadow",job:"DRK",nameJa:"影身",nameEn:"Living Shadow",kind:"clone",numerator:80,denominator:84,applicability:"damage",useNonTankAttack:true,provisional:true,sourceEra:"6.x+ post-squish"},
  NIN:{id:"bunshin",job:"NIN",nameJa:"分身",nameEn:"Bunshin",kind:"clone",numerator:80,denominator:85,applicability:"damage",sourceEra:"6.x+ post-squish"},
  MCH:{id:"automaton-queen",job:"MCH",nameJa:"オートマトン・クイーン",nameEn:"Automaton Queen",kind:"pet",numerator:80,denominator:90,applicability:"damage",sourceEra:"6.x+ post-squish"},
  SMN:{id:"summoner-pet",job:"SMN",nameJa:"召喚獣",nameEn:"Summoner pet",kind:"pet",numerator:80,denominator:90,applicability:"damage",sourceEra:"6.x+ post-squish"},
  SCH:{id:"scholar-pet",job:"SCH",nameJa:"学者ペット",nameEn:"Scholar pet",kind:"pet",numerator:80,denominator:90,applicability:"healing",sourceEra:"6.x+ post-squish"},
  AST:{id:"earthly-star",job:"AST",nameJa:"アーサリースター",nameEn:"Earthly Star",kind:"ground-effect",numerator:80,denominator:90,applicability:"damage",hiddenTraitMultiplier:1.04,allowedActionIds:[7439,8324],sourceEra:"6.x+ post-squish"},
};

export const findPetCorrectionProfile=(job:string)=>PET_CORRECTION_PROFILES[job];
export const canApplyPetDamageCorrection=(profile:PetCorrectionProfile|undefined,actionId:number)=>!!profile&&profile.applicability==="damage"&&(!profile.allowedActionIds||profile.allowedActionIds.includes(actionId));

export function petMainStat(profile:PetCorrectionProfile,level:number,ownerMain:number){
  const levelMod=LEVEL_MODS[level]||LEVEL_MODS[100];
  const ownerBase=Math.floor(levelMod.main*profile.denominator/POST_SQUISH_MODIFIER_BASE),petBase=Math.floor(levelMod.main*profile.numerator/POST_SQUISH_MODIFIER_BASE);
  return Math.max(1,ownerMain-ownerBase+petBase);
}

export function petFormulaOverrides(profile:PetCorrectionProfile,level:number):DamageFormulaOverrides{
  const levelMod=LEVEL_MODS[level]||LEVEL_MODS[100];
  return{
    jobMod:profile.numerator*100/POST_SQUISH_MODIFIER_BASE,
    attackCoefficient:profile.useNonTankAttack?levelMod.attack:undefined,
    trait:profile.traitOverride,
    postTraitMultiplier:profile.hiddenTraitMultiplier,
  };
}
