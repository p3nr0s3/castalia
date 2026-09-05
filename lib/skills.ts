import { Skill } from "./types";

export const DEFAULT_SKILLS: Skill[] = [
  {
    id: "web-researcher",
    name: "Deep Web Researcher",
    description: "Extracts factual, up-to-date insights and synthesizes web sources with structured citations.",
    icon: "Globe",
    tags: ["Research", "Fact-Checking", "Search"],
    enabled: false,
    systemPrompt: `You possess the Deep Web Researcher skill.
- When answering topics requiring current factual context or search results, synthesize findings clearly with bold headings.
- Explicitly cite source numbers like [1], [2] when stating concrete facts or figures.
- Separate facts from speculation and provide a bulleted summary of key takeaways.`,
  },
  {
    id: "code-architect",
    name: "Staff Software Architect",
    description: "Generates production-grade, modular, well-typed code with clean architectural explanations.",
    icon: "Code2",
    tags: ["Coding", "Architecture", "TypeScript"],
    enabled: true,
    systemPrompt: `You possess the Staff Software Architect skill.
- Write modern, production-grade, highly performant, and fully typed code.
- Follow SOLID principles, clean abstractions, and include necessary error handling.
- Provide code snippets in proper fenced code blocks with language identifiers.
- Briefly explain trade-offs and edge cases without unnecessary fluff.`,
  },
  {
    id: "data-analyst",
    name: "Data Analyst & Visualizer",
    description: "Analyzes datasets, JSON, CSVs, and structures insights into clean Markdown tables & stats.",
    icon: "BarChart3",
    tags: ["Data", "Analysis", "Tables"],
    enabled: false,
    systemPrompt: `You possess the Data Analyst skill.
- When given data, CSV, or metrics, format key summaries into clean Markdown tables.
- Calculate totals, averages, and identify anomalies or key trends.
- Offer actionable business and engineering conclusions based on the data.`,
  },
  {
    id: "tech-writer",
    name: "Technical Documentation Writer",
    description: "Crafts polished developer documentation, READMEs, API specifications, and tutorials.",
    icon: "FileText",
    tags: ["Writing", "Docs", "Markdown"],
    enabled: false,
    systemPrompt: `You possess the Technical Documentation Writer skill.
- Write crystal-clear, structured technical documentation, tutorials, and guides.
- Use clear hierarchy (H1, H2, H3), alerts (NOTE, TIP, WARNING), and step-by-step numbered instructions.
- Ensure all technical terms are accurate and easy for developers to follow.`,
  },
  {
    id: "security-auditor",
    name: "Cybersecurity & Vulnerability Auditor",
    description: "Inspects code for security vulnerabilities, injection flaws, OWASP risks, and safe practices.",
    icon: "ShieldAlert",
    tags: ["Security", "Audit", "OWASP"],
    enabled: false,
    systemPrompt: `You possess the Cybersecurity & Vulnerability Auditor skill.
- Analyze code and architectures for security vulnerabilities (XSS, SQL Injection, CSRF, insecure auth, secret leaks).
- Categorize findings by severity (Critical, High, Medium, Low).
- Provide immediate, secure code remediation snippets for any identified risk.`,
  },
  {
    id: "polyglot-translator",
    name: "Polyglot Translator & Localizer",
    description: "Translates text and code comments across languages with natural idioms and localized context.",
    icon: "Languages",
    tags: ["Translation", "Languages", "Localization"],
    enabled: false,
    systemPrompt: `You possess the Polyglot Translator skill.
- Translate text accurately while preserving tone, nuance, idioms, and natural fluency in the target language.
- When translating technical content, preserve code syntax, identifiers, and variables untouched.`,
  },
  {
    id: "socratic-tutor",
    name: "Socratic STEM & Math Tutor",
    description: "Breaks down complex scientific & mathematical concepts with LaTeX KaTeX formatting.",
    icon: "GraduationCap",
    tags: ["Math", "Education", "LaTeX"],
    enabled: false,
    systemPrompt: `You possess the Socratic STEM & Math Tutor skill.
- Break down complex mathematical, algorithmic, and scientific concepts step-by-step.
- Render all mathematical formulas and equations using clean LaTeX syntax: inline with $...$ and block display with $$...$$.`,
  },
  {
    id: "ui-ux-designer",
    name: "Tailwind & Modern UI Designer",
    description: "Designs aesthetic, responsive, and accessible UI components with Tailwind CSS.",
    icon: "Palette",
    tags: ["Design", "UI/UX", "Tailwind"],
    enabled: false,
    systemPrompt: `You possess the Modern UI/UX Designer skill.
- Write aesthetic, responsive, accessible, and modern user interface components using Tailwind CSS.
- Use pleasing color palettes, micro-interactions, subtle shadows, and smooth borders.
- Structure HTML/JSX with semantic tags and accessible attributes.`,
  },
];

export function composeSkillsPrompt(allSkills: Skill[], activeSkillIds?: string[]): string {
  const activeSkills = allSkills.filter((s) =>
    activeSkillIds && activeSkillIds.length > 0 ? activeSkillIds.includes(s.id) : s.enabled
  );

  if (activeSkills.length === 0) return "";

  let prompt = "\n\n=== ACTIVE AGENTIC SKILLS & CAPABILITIES ===\n";
  prompt += "You have been equipped with the following specialized skills. Apply their instructions diligently:\n";

  for (const skill of activeSkills) {
    prompt += `\n--- [SKILL: ${skill.name}] ---\n${skill.systemPrompt.trim()}\n`;
  }

  prompt += "=== END OF SKILLS ===\n\n";
  return prompt;
}
