import { d20Roll } from "../dice/dice.mjs";
import { GetSpeedScale } from "../helpers/data-tables.mjs";
import ActiveEffectMnm3e from "../helpers/effects.mjs";

/** @typedef {import("../documentation/actor-documentation.mjs").actorData} actorData */

/**
 * Extend the base Actor document by defining a custom roll data structure which is ideal for the Simple system.
 * @extends {Actor}
 * @type {actorData} Actor
 */
export class FoundryMnM3eActor extends Actor {

  /** @override */
  prepareData() {
    if (!game.template.Actor.types.includes(this.type)) return;
    super.prepareData();
    this.items.forEach(item => item.prepareFinalAttributes());
  }

  /** @override */
  prepareBaseData() {
    // Data modifications in this step occur before processing embedded
    /* documents or derived data.
    const updates = {};
    this._prepareBaseAbilities(updates);
    this._prepareBaseSkills(updates);
    switch (this.type) {
      case "hero":
        return this._prepareCharacterData(updates);
      case "vehicle":
        return null;
      case "base":
        return null;
    }*/
  }

  /**
   * @override
   * Augment the basic actor data with additional dynamic data. Typically,
   * you'll want to handle most of your calculated/derived data in this step.
   * Data calculated in this step should generally not exist in template.json
   * (such as ability modifiers rather than ability scores) and should be
   * available both inside and outside of character sheets (such as if an actor
   * is queried and has a roll executed directly from it).
   */
  prepareDerivedData() {
    /** @type {actorData} */
    const actorData = this;
    const systemData = actorData.system;
    const flags = actorData.flags.foundrymnm3e || {};
    this.labels = {};

    // Make separate methods for each Actor type (character, npc, etc.) to keep
    // things organized.
    this._preparePowerCost(actorData);

    this._prepareCharacterData(actorData);
    //this.prepareSpeeds();
    //this._prepareNpcData(actorData);
  }

  /**
   * @param {actorData} actorData 
   * @returns 
   */
  _prepareBaseAbilities(actorData) {
    if (actorData.type !== "hero") return;

    const systemData = actorData.system;

    const abilities = {};
    for (const key of Object.keys(CONFIG.MNM3E.abilities)) {
      abilities[key] = systemData.abilities[key];
    }
    systemData.abilities = abilities;

    const defenses = {};
    for (const key of Object.keys(CONFIG.MNM3E.defenses)) {
      defenses[key] = systemData.defenses[key];
    }
    systemData.defenses = defenses;

    const skills = {};
    for (const key of Object.keys(CONFIG.MNM3E.skills)) {
      skills[key] = systemData.skills[key];
    }
    systemData.skills = skills;
  }

  /**
   * Prepare Character type specific data
   * @param {actorData} actorData 
   */
  _prepareCharacterData(actorData) {
    if (actorData.type !== "hero") return;

    const systemData = actorData.system;

    if (systemData.details.hero_identity.image == "") systemData.details.hero_identity.image = "icons/svg/mystery-man.svg";
    if (systemData.details.civilian_identity.image == "") systemData.details.civilian_identity.image = "icons/svg/mystery-man.svg";

    if (systemData.details.hero_identity.name == "") {
      systemData.details.hero_identity.name = actorData.name;
    }

    systemData.generic.pp = Math.max(systemData.generic.pl * 15, 15) + systemData.generic.extrapp;

    for (let [key, ability] of Object.entries(systemData.abilities)) {
      if (ability.purchased >= -5) {
        ability.total = ability.purchased + ability.misc + ability.auto;
        systemData.generic.pp_ability += ability.purchased * 2;
      }
      else {
        ability.total = -100;
        systemData.generic.pp_ability += -5 * 2;
      }
    }

    for (let [key, defense] of Object.entries(systemData.defenses)) {
      if (systemData.abilities[defense.ability].total > -6) {
        defense.default = systemData.abilities[defense.ability].total;
        defense.total = defense.purchased + defense.misc + defense.auto + defense.default;
        defense.ac = 10 + parseInt(defense.total);
      }
      else {
        defense.default = 0;
        if (key == 'toughness') {
          defense.total = defense.misc + defense.auto;
          defense.ac = 10 + parseInt(defense.total);
        }
        else {
          defense.total = -100;
        }
      }
      systemData.generic.pp_defenses += defense.purchased;
    }

    for (let [key, skill] of Object.entries(systemData.skills)) {
      skill.default = systemData.abilities[skill.ability].purchased > -6 ? systemData.abilities[skill.ability].total : 0;
      skill.total = skill.default + skill.purchased + skill.misc + skill.auto;
      systemData.generic.pp_skills += skill.purchased / 2;
    }
    
    systemData.generic.pp_spent = systemData.generic.pp_ability + systemData.generic.pp_defenses + systemData.generic.pp_skills + systemData.generic.pp_advantages + systemData.generic.pp_powers;

    systemData.generic.initiative = systemData.abilities.agl.total;
  }

  /**
   * @param {actorData} data 
   * @param {Object} options 
   * @param {String} userId 
   */
  _onUpdate(data, options, userId) {
    super._onUpdate(data, options, userId);

    if(data.system.details?.hero_identity?.name || data.system.details?.civilian_identity?.name)
    {
      let updates = [{ _id: this.id, name: ""}];
      if(this.system.details.active_identity)
      {
        updates[0].name =  this.system.details.hero_identity.name;
      }
      else
      {
        updates[0].name = this.system.details.civilian_identity.name;
      }
      Actor.updateDocuments(updates);
    }
  }

  /**
   * Prepare cost of Powers and Advantages
   * @param {actorData} actorData 
   */
  _preparePowerCost(actorData) {
    const systemData = actorData.system;

    let powcost = this.items.reduce((powcost, i) => {
      if (i.type != "power") return powcost;
      const c = i.system.power_cost.active_cost || 0;
      return powcost + c;
    }, 0)

    systemData.generic.pp_powers = powcost;

    let advcost = this.items.reduce((advcost, i) => {
      if (i.type != "advantage" || i.system.enchanced) return advcost;
      const c = i.system.ranks || 0;
      return advcost + c;
    }, 0)

    systemData.generic.pp_advantages = advcost;
  }

  prepareSpeeds() {
    const speeds = this.system.speed;
    const v = '';

    const types = ["walk", 'burrowing', 'flight', 'leaping', 'swimming', 'teleport'];
    types.forEach(element => {
      if (!speeds[element].active) return;
      // Try to remove distance from template
      speeds[element].distance = GetSpeedScale(speeds[element].rank, element);
      speeds[element].displaydistance = GetSpeedScale(speeds[element].rank, element, true)
    });
  }

  /**
   * Override getRollData() that's supplied to rolls.
   */
  getRollData() {
    const data = { ...super.getRollData() };

    // Prepare character roll data.
    this._getCharacterRollData(data);

    return data;
  }

  /**
   * Prepare character roll data.
   */
  _getCharacterRollData(data) {
    if (this.type !== 'hero') return;
  }

  /**
 * Roll a generic ability test or saving throw.
 * Prompt the user for input on which variety of roll they want to do.
 * @param {string} abilityId    The ability id (e.g. "str")
 * @param {object} options      Options which configure how ability tests or saving throws are rolled
 */
  // FIXME: Add Debilitated, Absent check and roll change
  async rollAbility(abilityId, options = {}) {
    const label = CONFIG.MNM3E.abilities[abilityId] ?? "";
    const abl = this.system.abilities[abilityId];
    if (abl.purchased < -6) {
      console.debug("Absent");
    }
    else if (abl.auto < -6) {
      console.debug("Debilitated");
    }
    else {
      const parts = [];
      const data = this.getRollData();

      parts.push("@purchased");
      data.purchased = abl.purchased;

      if (abl.misc != 0) {
        parts.push("@misc");
        data.misc = abl.misc;
      }

      if (abl.auto != 0) {
        parts.push("@auto");
        data.auto = abl.auto;
      }

      // Roll and return
      const flavor = game.i18n.format("MNM3E.AbilityPromptTitle", { ability: label });
      const rollData = foundry.utils.mergeObject({
        data,
        title: `${flavor}: ${this.name}`,
        flavor,
        messageData: {
          speaker: options.speaker || ChatMessage.getSpeaker({ actor: this }),
          "flags.foundrymnm3e.roll": { type: "ability", abilityId }
        }
      }, options);
      rollData.parts = parts.concat(options.parts ?? []);

      const roll = await d20Roll(rollData);
      return roll;
    }
  }

  // FIXME: Add Disabled check and roll change
  async rollDefense(defenseId, options = {}) {
    const label = CONFIG.MNM3E.defenses[defenseId] ?? "";
    const def = this.system.defenses[defenseId];
    if (def?.immune) {
      console.debug("Immune");
    }
    else if (def.total < -6) {
      console.debug("Debilitated");
    }
    else {
      const parts = [];
      const data = this.getRollData();

      parts.push("@default");
      data.default = def.default;

      parts.push("@purchased");
      data.purchased = def.purchased;

      if (def.misc != 0) {
        parts.push("@misc");
        data.misc = def.misc;
      }

      if (def.auto != 0) {
        parts.push("@auto");
        data.auto = def.auto;
      }

      // parts.push("@total");
      // data.total = def?.total ?? 0;

      // Roll and return
      const flavor = game.i18n.format("MNM3E.DefensePromptTitle", { defense: label });
      const rollData = foundry.utils.mergeObject({
        data,
        title: `${flavor}: ${this.name}`,
        flavor,
        messageData: {
          speaker: options.speaker || ChatMessage.getSpeaker({ actor: this }),
          "flags.foundrymnm3e.roll": { type: "defense", defenseId }
        }
      }, options);
      rollData.parts = parts.concat(options.parts ?? []);

      const roll = await d20Roll(rollData);
      return roll;
    }
  }

  // FIXME: Add Disabled check and roll change
  async rollSkill(skillId, options = {}) {
    const skl = this.system.skills[skillId];
    const label = skl.subtype != null ? skl.subtype : CONFIG.MNM3E.skills[skillId];
    const parts = [];
    const data = this.getRollData();

    parts.push("@default");
    data.default = skl.default;

    parts.push("@purchased");
    data.purchased = skl.purchased;

    if (skl.misc != 0) {
      parts.push("@misc");
      data.misc = skl.misc;
    }

    if (skl.auto != 0) {
      parts.push("@auto");
      data.auto = skl.auto;
    }

    // Roll and return
    const flavor = game.i18n.format("MNM3E.SkillPromptTitle", { skill: label });
    const rollData = foundry.utils.mergeObject({
      data,
      title: `${flavor}: ${this.name}`,
      flavor,
      messageData: {
        speaker: options.speaker || ChatMessage.getSpeaker({ actor: this }),
        "flags.foundrymnm3e.roll": { type: "skill", skillId }
      }
    }, options);
    rollData.parts = parts.concat(options.parts ?? []);

    const roll = await d20Roll(rollData);
    return roll;
  }

  async changeState() {
    /** @type {import("../documentation/actor-documentation.mjs").system} */
    var system = this.system;
    let updates = [{ _id: this.id, name: "", img: "" }];

    updates[0]['system.details.active_identity'] = !system.details.active_identity;

    if (!system.details.active_identity) {
      updates[0].name = system.details.hero_identity.name;
      updates[0].img = system.details.hero_identity.image;
    }
    else {
      updates[0].name = system.details.civilian_identity.name;
      updates[0].img = system.details.civilian_identity.image;
    }
    Actor.updateDocuments(updates);
  }
}

Hooks.on("renderActorSheet", (app, html, data) => {
  /** @type {import("../documentation/actor-documentation.mjs").system} */
  const system = data.system;

  if (system.generic.pp_spent > system.generic.pp) {
    html.find(".attribute-value.multiple .ppspent")[0].style.background = "rgba(255, 0, 0, 0.7)";
  }
  if (!Number.isInteger(system.generic.pp_skills)) {
    html.find(".skills-list")[0].style.borderColor = "red";
    html.find(".attribute-value.multiple .ppspent")[0].style.background = "rgba(255, 0, 0, 0.7)";
    html.find(".pptooltip .skills-spent")[0].style.background = "rgba(255, 0, 0, 0.7)";
  }

  if (system.defenses.dodge.total + system.defenses.toughness.total > system.generic.pl * 2 || system.defenses.parry.total + system.defenses.toughness.total > system.generic.pl * 2) {
    html.find(".defense-list")[0].style.borderColor = "red";
    let defrow = html.find(".defense-row");
    defrow[0].style.background = "rgba(255, 0, 0, 0.2)";
    defrow[1].style.background = "rgba(255, 0, 0, 0.2)";
    defrow[3].style.background = "rgba(255, 0, 0, 0.2)";
  }

  if (system.defenses.fortitude.total + system.defenses.will.total > system.generic.pl * 2) {
    html.find(".defense-list")[0].style.borderColor = "red";
    let defrow = html.find(".defense-row");
    defrow[2].style.background = "rgba(255, 0, 0, 0.2)";
    defrow[4].style.background = "rgba(255, 0, 0, 0.2)";
  }
});