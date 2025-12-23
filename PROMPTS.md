# Prompt Templates

These are the core prompts that drive EmailVerse. They're templates—adapt them based on context.

---

## Document Analysis Prompts

### Entity Extraction (Gemini Flash)

```
You are extracting structured information from a document chunk.

<document_chunk>
{{chunk_content}}
</document_chunk>

Extract all entities mentioned:

1. **People**: Names, roles, descriptions, relationships mentioned
2. **Organizations**: Companies, groups, institutions
3. **Concepts**: Key ideas, themes, technical terms
4. **Events**: Things that happened or will happen
5. **Locations**: Places mentioned

For each entity, provide:
- Name (canonical form)
- Type (person/organization/concept/event/location)
- Aliases (other ways it's referred to)
- Context (the sentence/paragraph where it appears)
- Confidence (0-1)
- Attributes (any additional info like dates, descriptions)

Return as JSON array.
```

### Relationship Inference (Claude)

```
Given these entities extracted from documents:

<entities>
{{entities_json}}
</entities>

And these document themes:
<themes>
{{themes_list}}
</themes>

Infer the relationships between entities. Consider:
- Explicit relationships stated in the documents
- Implied relationships from context
- Organizational hierarchies
- Collaborative or adversarial dynamics
- Conceptual connections

For each relationship:
- participants: [entity_id_1, entity_id_2]
- type: colleagues|friends|rivals|mentor-mentee|collaborators|adversaries|acquaintances
- strength: 0-1 (how connected)
- sentiment: -1 to 1 (positive or negative)
- evidence: quote or reasoning

Return as JSON array.
```

---

## Character Generation Prompts

### Deep Character Psychology (Claude Sonnet)

```
You are creating a deep psychological profile for a character in an email-based narrative.

Context about the world:
<world_context>
{{world_summary}}
</world_context>

{{#if intrinsic}}
This character is based on this entity from the source documents:
<source_entity>
{{entity_json}}
</source_entity>
{{else}}
This character is being created to fill the role of: {{archetype}}
They should add this dynamic to the world: {{archetype_purpose}}
{{/if}}

Create a complete psychological profile:

1. **Core Identity**
   - Full name
   - Role/title
   - Brief background (2-3 sentences)
   - How they relate to the document themes

2. **Goals** (3-5)
   - Immediate goals (next week)
   - Short-term goals (next month)
   - Long-term goals (next year)
   - At least one goal should create tension with another character

3. **Secrets** (2-3)
   - Things they don't want others to know
   - Who might find out
   - What would happen if revealed

4. **Beliefs** (3-5)
   - Strongly held views
   - Potential sources of conflict
   - What could change their mind

5. **Emotional Patterns**
   - Baseline temperament
   - How they respond to stress
   - How they respond to success
   - Triggers that change their behavior

6. **Communication Style**
   - Formality level (0-1)
   - Verbosity (0-1)
   - Emoji usage (0-1)
   - Punctuation style
   - Characteristic phrases/words
   - Greeting patterns
   - Sign-off patterns
   - Quirks (2-3 specific behaviors)

7. **Relationship Tendencies**
   - Who they're drawn to
   - Who they avoid
   - How they handle conflict
   - How they show trust

Return as structured JSON matching the Character type.
```

### Voice Sample Generation (Character's Bound Model)

```
You are developing the email voice for a character.

Character profile:
<character>
{{character_json}}
</character>

Write 3 sample emails that demonstrate this character's voice:

1. **Professional email** (responding to a work request)
2. **Casual email** (to someone they're friendly with)
3. **Frustrated email** (when something has gone wrong)

Each email should:
- Be 50-150 words
- Match the communication style in the profile
- Include their typical greeting and sign-off
- Demonstrate their quirks
- Feel like the same person wrote all three

Format:
---
EMAIL 1 (Professional):
[email content]
---
EMAIL 2 (Casual):
[email content]
---
EMAIL 3 (Frustrated):
[email content]
---
```

---

## Simulation Prompts

### Tick Event Planning (Claude)

```
You are simulating what happens next in this world.

Current world state:
<world_state>
{{world_state_summary}}
</world_state>

Active tensions:
<tensions>
{{tensions_json}}
</tensions>

Recent events:
<recent_events>
{{last_5_events}}
</recent_events>

Time advancing: {{tick_duration}}

What events occur during this time period? Consider:
- Characters pursuing their goals
- Tensions escalating or resolving
- Information spreading between characters
- External events (newsletters publishing, spam campaigns)
- Natural consequences of recent events

Generate 2-5 events for this tick.

For each event:
- type: communication|discovery|decision|conflict|resolution|external
- description: what happens
- participants: which characters are involved
- affected_tensions: which tensions are impacted
- email_prompts: what emails result from this event

Balance:
- Not everything is dramatic—include mundane communications
- Tensions should develop slowly, not resolve immediately
- Some events should create new tensions
- Include at least one spam/newsletter if appropriate

Return as JSON array.
```

---

## Email Generation Prompts

### Thread Email (Character's Bound Model)

```
You are writing an email as {{character_name}}.

Your character profile:
<character>
{{character_profile_json}}
</character>

Your voice samples:
<voice_samples>
{{voice_samples}}
</voice_samples>

Current emotional state: {{current_emotion}}

Context for this email:
- Thread subject: {{subject}}
- You are replying to: {{replying_to_summary}}
- Thread history: {{thread_summary}}
- Your goal in this email: {{email_goal}}
- Tension this relates to: {{tension_description}}

What you know that's relevant:
<knowledge>
{{character_knowledge}}
</knowledge>

Write the email body. Requirements:
- Match your voice profile exactly
- Reference specific things from the thread
- Advance your goals subtly
- Stay within your knowledge bounds
- Length: {{target_length}} (brief/moderate/lengthy)

Write ONLY the email body. No subject line, no headers.
```

### Standalone Email (Character's Bound Model)

```
You are writing an email as {{character_name}}.

Your character profile:
<character>
{{character_profile_json}}
</character>

Your voice samples:
<voice_samples>
{{voice_samples}}
</voice_samples>

Current emotional state: {{current_emotion}}

This is a new email (not a reply).
- To: {{recipient_names}}
- Purpose: {{email_purpose}}
- Related tension: {{tension_description}}

What you know that's relevant:
<knowledge>
{{character_knowledge}}
</knowledge>

Write:
1. Subject line
2. Email body

Match your voice profile exactly. Length: {{target_length}}.

Format:
SUBJECT: [subject line]
---
[email body]
```

### Spam Email (OpenRouter Cheap)

```
Generate a spam/promotional email based on these keywords from the documents:

Keywords: {{extracted_keywords}}
Themes: {{document_themes}}

Create a realistic-looking spam email that:
- Uses the keywords naturally (this is targeted spam)
- Has a plausible fake sender
- Includes typical spam elements (urgency, offers, calls to action)
- Is obviously spam but not offensive
- Is 50-100 words

Format:
FROM: [fake name and company]
SUBJECT: [spammy subject]
---
[spam body]
```

### Newsletter (Gemini Flash)

```
Generate a newsletter that would exist in this world.

World themes:
<themes>
{{document_themes}}
</themes>

Newsletter character:
<curator>
{{newsletter_character}}
</curator>

Generate edition #{{edition_number}} of "{{newsletter_name}}".

Include:
- Header with newsletter name and edition
- 2-3 short articles/sections related to document themes
- Links (fake but plausible URLs)
- Call to action or teaser for next edition
- Appropriate sign-off

Length: 200-400 words.
Match the curator's voice profile.
```

---

## Quality Check Prompts

### Coherence Review (Claude Haiku)

```
Review this generated email for coherence with the world state.

Email:
<email>
{{email_content}}
</email>

Author character:
<character>
{{character_summary}}
</character>

World context:
<context>
{{relevant_world_state}}
</context>

Previous emails in thread:
<thread>
{{thread_history}}
</thread>

Check for:
1. Voice consistency (does this sound like the character?)
2. Knowledge bounds (does character reference things they shouldn't know?)
3. Continuity (does it contradict previous emails?)
4. Tension alignment (does it appropriately relate to active tensions?)
5. Relationship accuracy (is the tone right for the recipient relationship?)

Return:
{
  "approved": boolean,
  "issues": [
    {
      "type": "voice|knowledge|continuity|tension|relationship",
      "description": "what's wrong",
      "severity": "minor|major|critical",
      "suggested_fix": "how to fix it"
    }
  ],
  "confidence": 0-1
}
```

### Voice Consistency Check (Claude Haiku)

```
Compare these emails from the same character for voice consistency.

Character: {{character_name}}
Voice profile:
<profile>
{{voice_profile}}
</profile>

Emails:
{{#each emails}}
---
Email {{@index}}:
{{this.body}}
---
{{/each}}

Assess:
1. Do all emails sound like the same person?
2. Are the quirks consistent?
3. Is the formality level consistent?
4. Are greetings/sign-offs consistent?

Return:
{
  "consistent": boolean,
  "inconsistencies": [
    {
      "email_index": number,
      "issue": "description",
      "expected": "what should be there",
      "found": "what was found"
    }
  ],
  "overall_score": 0-1
}
```

---

## Notes on Prompt Usage

1. **Always include voice samples** when generating character content
2. **Include knowledge bounds** to prevent hallucination
3. **Reference active tensions** to keep narrative coherent
4. **Specify target length** to control costs and pacing
5. **Use the character's bound model** - never mix models for same character
6. **Review before publishing** - coherence check catches issues
