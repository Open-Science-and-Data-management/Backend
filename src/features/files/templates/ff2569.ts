// ff2569 template — schema ฟอร์ม Full Proposal FF2569 (ตายตัว) — single source of truth ของการ map เอกสารเข้า field
// เลขข้อในเอกสารซ้ำ/เพี้ยน (10. ซ้ำ, ข้อ 4/6 หาย) จึงห้ามใช้เป็น ID — parser/extractor อิง fieldId จากไฟล์นี้เท่านั้น
// (Q1/Q11/Q12 — docs/specs/SPEC-ff2569-form-rag.md, docs/research/ff2569-form-rag-structure.md §1.1)
import { z } from "zod";

export const FF2569_TEMPLATE_VERSION = "FF2569";

// ── field/child schemas ──────────────────────────────────────────────────────
// labels = ข้อความตัวเลือกในเอกสารที่ใช้จับ w14:checkbox state (match แบบ tolerant ใน form-extract)
export const templateOptionSchema = z.object({
  value: z.string().regex(/^[a-z][a-z0-9_]*$/),
  labels: z.array(z.string().min(1)).min(1),
});
export type TemplateOption = z.infer<typeof templateOptionSchema>;

// child ของ field แบบโครงซ้ำ (subactivity) — ไม่มี sectionId เอง (สืบทอดจาก parent), ซ้อนได้ชั้นเดียว
export const templateChildSchema = z.object({
  fieldId: z.string().regex(/^[a-z][a-z0-9_]*$/),
  question: z.string().min(1),
  type: z.enum(["text", "long_text", "list", "enum", "bool", "table", "image"]),
  options: z.array(templateOptionSchema).optional(),
  tableColumns: z.array(z.string().min(1)).optional(),
});
export type TemplateChild = z.infer<typeof templateChildSchema>;

export const templateFieldSchema = z.object({
  fieldId: z.string().regex(/^[a-z][a-z0-9_]*$/),
  sectionId: z.string().regex(/^[a-z][a-z0-9_]*$/),
  question: z.string().min(1),
  type: z.enum(["text", "long_text", "list", "enum", "bool", "table", "image"]),
  options: z.array(templateOptionSchema).optional(),
  tableColumns: z.array(z.string().min(1)).optional(),
  children: z.array(templateChildSchema).optional(),
  repeats: z.number().int().min(2).optional(),
});
export type TemplateField = z.infer<typeof templateFieldSchema>;

export const templateSectionSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  title: z.string().min(1), // ชื่อส่วนตามเอกสาร — ใช้ต่อ heading_path ("ส่วนที่ 1 > …")
});
export type TemplateSection = z.infer<typeof templateSectionSchema>;

export const ff2569TemplateSchema = z.object({
  version: z.literal("FF2569"),
  sections: z.array(templateSectionSchema).min(4),
  fields: z.array(templateFieldSchema).min(25),
});
export type Ff2569Template = z.infer<typeof ff2569TemplateSchema>;

// ── sections (ตาม logical structure ในรายงาน §2) ────────────────────────────
const sections: TemplateSection[] = [
  { id: "s0_header", title: "หัวฟอร์ม (หน่วยงาน/ปีงบประมาณ/ประเภททุน)" },
  { id: "s1_general", title: "ส่วนที่ 1 ข้อมูลทั่วไป" },
  { id: "s2_project", title: "ส่วนที่ 2 ข้อมูลโครงการ" },
  { id: "s3_plan", title: "ส่วนที่ 3 แผนงาน: แผนการดำเนินงานโครงการ" },
  { id: "s4_outputs", title: "ส่วนที่ 4 ผลผลิต/ผลลัพธ์/ผลกระทบ" },
];

// ── fields ───────────────────────────────────────────────────────────────────
const fields: TemplateField[] = [
  // s0 หัวฟอร์ม
  { fieldId: "institution", sectionId: "s0_header", question: "ชื่อหน่วยงาน", type: "text" },
  { fieldId: "fiscal_year", sectionId: "s0_header", question: "ปีงบประมาณ", type: "text" },
  { fieldId: "fund_type", sectionId: "s0_header", question: "ประเภททุน/แบบฟอร์มข้อเสนอโครงการ", type: "text" },

  // s1 ข้อมูลทั่วไป
  {
    fieldId: "plan_type",
    sectionId: "s1_general",
    question: "โครงการวิจัยและนวัตกรรมนี้อยู่ภายใต้แผนงาน (เลือก 1 แผนงาน)",
    type: "enum",
    options: [
      { value: "basic_research", labels: ["การวิจัยพื้นฐาน (Basic research)"] },
      { value: "interdisciplinary_research", labels: ["การวิจัยประยุกต์สหสาขา (Interdisciplinary Research)"] },
      { value: "innovation_research", labels: ["การพัฒนานวัตกรรม (Innovation Research)"] },
      { value: "technology_development", labels: ["การพัฒนาวิทยาศาสตร์เทคโนโลยี (Technology Development)"] },
    ],
  },
  { fieldId: "title_th", sectionId: "s1_general", question: "ชื่อโครงการวิจัยและนวัตกรรม (ภาษาไทย)", type: "text" },
  { fieldId: "title_en", sectionId: "s1_general", question: "ชื่อโครงการวิจัยและนวัตกรรม (ภาษาอังกฤษ)", type: "text" },
  {
    fieldId: "research_type",
    sectionId: "s1_general",
    question: "ประเภทของการวิจัย",
    type: "enum",
    options: [
      { value: "basic_research", labels: ["การวิจัยพื้นฐาน (Basic Research)"] },
      { value: "applied_research", labels: ["การวิจัยประยุกต์ (Applied Research)"] },
    ],
  },
  {
    fieldId: "major_project",
    sectionId: "s1_general",
    question: "ได้ยื่นขอรับการพิจารณาเป็นโครงการเพื่อขับเคลื่อนการบรรลุเป้าหมายตามยุทธศาสตร์ชาติ (โครงการสำคัญ) หรือไม่",
    type: "bool",
    options: [
      { value: "submitted", labels: ["ได้ยื่นขอ", "ได้ยื่นขอรับการพิจารณาเป็นโครงการสำคัญ"] },
      { value: "not_submitted", labels: ["ไม่ได้ยื่นขอ", "ไม่ได้ยื่น", "ไม่ได้ยื่นขอรับการพิจารณาเป็นโครงการสำคัญ"] },
    ],
  },
  {
    fieldId: "sub_plan",
    sectionId: "s1_general",
    question: "ผลที่คาดว่าจะได้รับของโครงการนี้สอดคล้องหรือสนับสนุนแผนแม่บทย่อยใดมากที่สุด",
    type: "enum",
    options: [
      { value: "economy", labels: ["ด้านเศรษฐกิจ"] },
      { value: "society", labels: ["ด้านสังคม"] },
      { value: "environment", labels: ["ด้านสิ่งแวดล้อม"] },
      { value: "fundamental_knowledge", labels: ["ด้านองค์ความรู้พื้นฐาน"] },
      { value: "supporting_factors", labels: ["ด้านปัจจัยสนับสนุนในการวิจัยและพัฒนานวัตกรรม"] },
    ],
  },
  {
    fieldId: "project_nature",
    sectionId: "s1_general",
    question: "ลักษณะโครงการวิจัยและนวัตกรรม",
    type: "enum",
    options: [
      { value: "multi_year_promised", labels: ["เป็นโครงการ Multi-Year Promised Grant"] },
      { value: "new_project", labels: ["โครงการใหม่"] },
      { value: "continuous", labels: ["โครงการต่อเนื่อง จากปีงบประมาณที่ผ่านมา"] },
      { value: "continuous_contract", labels: ["โครงการต่อเนื่องที่มีข้อผูกพันสัญญา"] },
    ],
  },
  {
    fieldId: "yearly_budget",
    sectionId: "s1_general",
    question: "ปีงบประมาณและงบประมาณรายปีของโครงการ",
    type: "table",
    tableColumns: ["ปีงบประมาณ", "งบประมาณ (บาท)"],
  },
  {
    fieldId: "previous_results",
    sectionId: "s1_general",
    question: "ผลการดำเนินงานที่ผ่านมา (กรณีที่เป็นโครงการต่อเนื่อง)",
    type: "table",
    tableColumns: [
      "ปีงบประมาณ",
      "ผลการดำเนินงานเทียบกับแผนที่ตั้งไว้ (%)",
      "งบประมาณที่ได้รับจัดสรร (บาท)",
      "งบประมาณที่ใช้จริง (บาท)",
      "สัดส่วนงบประมาณที่ใช้จริง (%)",
    ],
  },
  {
    fieldId: "previous_results_summary",
    sectionId: "s1_general",
    question: "สรุปผลการดำเนินงานที่ผ่านมา (กิจกรรมที่ดำเนินการและผลผลิตที่เกิดขึ้นเป็นรูปธรรม)",
    type: "long_text",
  },
  {
    fieldId: "other_funding",
    sectionId: "s1_general",
    question: "โครงการยื่นขอรับทุนจากหน่วยงานอื่นหรือไม่",
    type: "bool",
    options: [
      { value: "not_applied", labels: ["ไม่ได้ยื่น"] },
      { value: "applied", labels: ["ยื่นขอรับทุนจากหน่วยงาน"] },
    ],
  },
  { fieldId: "other_funding_detail", sectionId: "s1_general", question: "หน่วยงานและปีงบประมาณที่ยื่นขอรับทุน", type: "text" },
  { fieldId: "keywords_th", sectionId: "s1_general", question: "คำสำคัญ (ภาษาไทย) กำหนดไม่เกิน 5 คำ", type: "list" },
  { fieldId: "keywords_en", sectionId: "s1_general", question: "คำสำคัญ (ภาษาอังกฤษ) กำหนดไม่เกิน 5 คำ", type: "list" },
  {
    fieldId: "oecd_field",
    sectionId: "s1_general",
    question: "สาขา OECD (สาขาหลัก/สาขาย่อย/สาขาที่เกี่ยวข้อง)",
    type: "table",
    tableColumns: ["สาขา OECD หลัก", "สาขา OECD ย่อย", "สาขา OECD ที่เกี่ยวข้อง"],
  },
  {
    fieldId: "research_team",
    sectionId: "s1_general",
    question: "รายละเอียดของคณะผู้วิจัยและพัฒนานวัตกรรม",
    type: "table",
    tableColumns: ["ชื่อ-สกุล", "หน่วยงาน", "ตำแหน่งในโครงการ", "สัดส่วนการดำเนินโครงการวิจัย (%)", "สถานะ"],
  },

  // s2 ข้อมูลโครงการ
  { fieldId: "executive_summary", sectionId: "s2_project", question: "บทสรุปข้อเสนอโครงการ", type: "long_text" },
  {
    fieldId: "rationale",
    sectionId: "s2_project",
    question: "หลักการและเหตุผล/ปัญหา/โจทย์การวิจัยและพัฒนานวัตกรรม",
    type: "long_text",
  },
  { fieldId: "objectives", sectionId: "s2_project", question: "วัตถุประสงค์", type: "list" },
  { fieldId: "research_framework", sectionId: "s2_project", question: "กรอบการวิจัย/พัฒนา (แผนภาพ)", type: "image" },
  {
    fieldId: "framework_description",
    sectionId: "s2_project",
    question: "คำอธิบายกรอบการวิจัย/พัฒนา (Input–Process–Output)",
    type: "long_text",
  },
  {
    fieldId: "subactivity",
    sectionId: "s2_project",
    question: "แนวคิด ทฤษฎี และสมมติฐานงานวิจัยและพัฒนานวัตกรรม — กิจกรรมย่อยที่ N",
    type: "text",
    repeats: 3,
    children: [
      { fieldId: "concept", question: "แนวคิด", type: "long_text" },
      { fieldId: "theory", question: "แนวคิด ทฤษฎีที่เกี่ยวข้อง", type: "long_text" },
      { fieldId: "hypothesis", question: "สมมติฐาน", type: "list" },
      { fieldId: "literature_review", question: "ทบทวนวรรณกรรมที่เกี่ยวข้อง", type: "long_text" },
      { fieldId: "references", question: "เอกสารอ้างอิง", type: "list" },
    ],
  },
  { fieldId: "methodology", sectionId: "s2_project", question: "ระเบียบวิธีวิจัยและวิธีการดำเนินการวิจัย", type: "list" },
  { fieldId: "final_outputs", sectionId: "s2_project", question: "ผลผลิตสุดท้ายเมื่อสิ้นสุดการดำเนินงานของโครงการ", type: "list" },
  { fieldId: "annual_targets", sectionId: "s2_project", question: "เป้าหมายรายปี", type: "text" },

  // s3 แผนงาน
  {
    fieldId: "work_plan",
    sectionId: "s3_plan",
    question: "แผนการดำเนินงาน (Gantt รายเดือน พร้อมร้อยละของกิจกรรม)",
    type: "table",
    tableColumns: ["ปีที่", "กิจกรรม", "เดือนที่คาดว่าจะดำเนินการ", "ร้อยละของกิจกรรม"],
  },
  {
    fieldId: "research_area",
    sectionId: "s3_plan",
    question: "พื้นที่ทำวิจัย/ดำเนินโครงการ",
    type: "table",
    tableColumns: ["ประเภท (ในประเทศ/ต่างประเทศ)", "ชื่อประเทศ/จังหวัด", "ชื่อสถานที่"],
  },
  {
    fieldId: "benefit_area",
    sectionId: "s3_plan",
    question: "พื้นที่ได้รับประโยชน์",
    type: "table",
    tableColumns: ["ประเภท (ในประเทศ/ต่างประเทศ)", "ชื่อประเทศ/จังหวัด", "ชื่อสถานที่"],
  },
  {
    fieldId: "budget_summary",
    sectionId: "s3_plan",
    question: "แผนการใช้จ่ายงบประมาณ — ประมาณการงบประมาณตลอดโครงการแบ่งเป็นหมวด",
    type: "long_text",
  },
  {
    fieldId: "equipment",
    sectionId: "s3_plan",
    question: "รายละเอียดการจัดซื้อครุภัณฑ์",
    type: "table",
    tableColumns: ["ชื่อครุภัณฑ์", "รายละเอียดครุภัณฑ์", "ครุภัณฑ์ที่มีอยู่เดิม/สถานภาพการใช้งาน", "เหตุผลและความจำเป็นต่อโครงการ", "การใช้ประโยชน์เมื่อโครงการสิ้นสุด"],
  },
  {
    fieldId: "collaborating_orgs",
    sectionId: "s3_plan",
    question: "หน่วยงานร่วมดำเนินการ/ภาคเอกชนหรือชุมชนที่ร่วมลงทุนหรือดำเนินการ",
    type: "table",
    tableColumns: ["ลำดับที่", "ปีงบประมาณ", "ชื่อหน่วยงานรัฐ/บริษัท/หน่วยงานต่างประเทศ", "แนวทางร่วมดำเนินการ", "การร่วมลงทุน in-cash (บาท)", "การร่วมลงทุน in-kind", "รวม"],
  },
  {
    fieldId: "research_standards",
    sectionId: "s3_plan",
    question: "มาตรฐานการวิจัย",
    type: "enum",
    options: [
      { value: "animal_testing", labels: ["มีการใช้สัตว์ทดลอง"] },
      { value: "human_research", labels: ["มีการวิจัยในมนุษย์"] },
      { value: "modern_biotech", labels: ["มีการวิจัยที่เกี่ยวข้องกับงานด้านเทคโนโลยีชีวภาพสมัยใหม่"] },
      { value: "chemical_lab", labels: ["มีการใช้ห้องปฏิบัติการที่เกี่ยวกับสารเคมี"] },
    ],
  },
  {
    fieldId: "readiness_level",
    sectionId: "s3_plan",
    question: "ระดับความพร้อมที่มีอยู่ในปัจจุบัน (TRL/SRL ณ ปัจจุบัน และเมื่องานวิจัยเสร็จสิ้น)",
    type: "long_text",
  },
  {
    fieldId: "impact_pathway",
    sectionId: "s3_plan",
    question: "แนวทางการขับเคลื่อนผลงานวิจัยและนวัตกรรมไปสู่ผลลัพธ์และผลกระทบ (การเชื่อมโยงผู้เชี่ยวชาญ/ผู้มีส่วนได้ส่วนเสีย)",
    type: "long_text",
  },
  {
    fieldId: "pi_experience",
    sectionId: "s3_plan",
    question: "ประสบการณ์การบริหารงานของหัวหน้าโครงการในการบริหารโครงการย้อนหลังไม่เกิน 5 ปี",
    type: "long_text",
  },

  // s4 ผลผลิต/ผลลัพธ์/ผลกระทบ
  {
    fieldId: "expected_outputs",
    sectionId: "s4_outputs",
    question: "ผลผลิตที่คาดว่าจะได้รับ (Output)",
    type: "table",
    tableColumns: ["ผลผลิตที่คาดว่าจะได้รับ", "ประเภทผลผลิต", "รายละเอียดของผลผลิต", "จำนวนนำส่ง", "หน่วยนับ", "ปีที่นำส่งผลผลิต"],
  },
  {
    fieldId: "output_to_outcome",
    sectionId: "s4_outputs",
    question: "ข้อมูลกระบวนการนำผลผลิตของโครงการไปสู่การสร้างผลลัพธ์ที่คาดว่าจะเกิดขึ้น",
    type: "table",
    tableColumns: ["ข้อมูลกระบวนการนำผลผลิตไปสู่ผลลัพธ์", "จำนวน", "หน่วยนับ", "รายละเอียดโดยสังเขป"],
  },
  {
    fieldId: "expected_impacts",
    sectionId: "s4_outputs",
    question: "ผลกระทบ (Expected Impacts) ที่คาดว่าจะเกิดขึ้น",
    type: "table",
    tableColumns: ["ผลที่คาดว่าจะได้รับ", "รายละเอียดผลกระทบ"],
  },
];

export const ff2569Template: Ff2569Template = { version: FF2569_TEMPLATE_VERSION, sections, fields };
