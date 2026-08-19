import {JOB_MOD,LEVEL_MODS,type DamageFormulaOverrides} from "./damage-formula";

export type PetCorrectionKind="pet"|"clone"|"ground-effect";
export type PetRacialStats="owner"|"midlander"|"none";
export type PetCorrectionProfile={
  id:string;job:string;nameJa:string;nameEn:string;kind:PetCorrectionKind;
  jobModifier:number;hiddenTraitMultiplier:number;receivesActionTrait:boolean;
  useNonTankAttack?:boolean;attackCoefficientByLevel?:Partial<Record<number,number>>;
  healingCoefficientByLevel?:Partial<Record<number,{coefficient:number;denominator:number}>>;
  inheritsPartyBonus:false;racialStats:PetRacialStats;sourceEra:"5.x";
};

export const PET_CORRECTION_SOURCE_URL="https://www.akhmorning.com/allagan-studies/how-to-be-a-math-wizard/shadowbringers/pets-and-misc-info/";

// Allagan Studies, Shadowbringers pet testing. Values that were only published
// for level 80 remain level-scoped instead of being extrapolated to 90/100.
export const PET_CORRECTION_PROFILES:Record<string,PetCorrectionProfile>={
  NIN:{id:"bunshin",job:"NIN",nameJa:"分身",nameEn:"Bunshin",kind:"clone",jobModifier:100,hiddenTraitMultiplier:1,receivesActionTrait:false,racialStats:"owner",inheritsPartyBonus:false,sourceEra:"5.x"},
  DRK:{id:"living-shadow",job:"DRK",nameJa:"影身",nameEn:"Living Shadow",kind:"clone",jobModifier:100,hiddenTraitMultiplier:1,receivesActionTrait:false,useNonTankAttack:true,racialStats:"midlander",inheritsPartyBonus:false,sourceEra:"5.x"},
  MCH:{id:"automaton-queen",job:"MCH",nameJa:"オートマトン・クイーン",nameEn:"Automaton Queen",kind:"pet",jobModifier:100,hiddenTraitMultiplier:1,receivesActionTrait:true,racialStats:"none",inheritsPartyBonus:false,sourceEra:"5.x"},
  SMN:{id:"summoner-pet",job:"SMN",nameJa:"召喚獣",nameEn:"Summoner pet",kind:"pet",jobModifier:100,hiddenTraitMultiplier:.8,receivesActionTrait:true,attackCoefficientByLevel:{80:180},racialStats:"none",inheritsPartyBonus:false,sourceEra:"5.x"},
  SCH:{id:"scholar-pet",job:"SCH",nameJa:"学者ペット",nameEn:"Scholar pet",kind:"pet",jobModifier:100,hiddenTraitMultiplier:.67,receivesActionTrait:true,healingCoefficientByLevel:{80:{coefficient:106,denominator:304}},racialStats:"none",inheritsPartyBonus:false,sourceEra:"5.x"},
  AST:{id:"earthly-star",job:"AST",nameJa:"アーサリースター",nameEn:"Earthly Star",kind:"ground-effect",jobModifier:100,hiddenTraitMultiplier:1.04,receivesActionTrait:true,racialStats:"owner",inheritsPartyBonus:false,sourceEra:"5.x"},
};

export const findPetCorrectionProfile=(job:string)=>PET_CORRECTION_PROFILES[job];

export function petMainStat(profile:PetCorrectionProfile,level:number,ownerMain:number){
  const levelMod=LEVEL_MODS[level]||LEVEL_MODS[100],ownerJobModifier=JOB_MOD[profile.job]||100;
  const ownerBase=Math.floor(levelMod.main*ownerJobModifier/100),petBase=Math.floor(levelMod.main*profile.jobModifier/100);
  return Math.max(1,ownerMain-ownerBase+petBase);
}

export function petFormulaOverrides(profile:PetCorrectionProfile,level:number):DamageFormulaOverrides{
  const levelMod=LEVEL_MODS[level]||LEVEL_MODS[100];
  return{
    jobMod:profile.jobModifier,
    attackCoefficient:profile.attackCoefficientByLevel?.[level]??(profile.useNonTankAttack?levelMod.attack:undefined),
    trait:profile.receivesActionTrait?undefined:100,
    postTraitMultiplier:profile.hiddenTraitMultiplier,
  };
}
