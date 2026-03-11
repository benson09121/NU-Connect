/**
 * seed-essentials.ts
 *
 * Seeds ONLY lookup / reference data needed for the app to function.
 * Safe to run on any environment (dev, staging, production).
 * Does NOT create demo users, organizations, events, or attendance.
 *
 * Run with:
 *   npx ts-node prisma/seed-essentials.ts
 *   -- or --
 *   npm run seed:essentials
 */

import 'dotenv/config';
import { PrismaClient } from '../lib/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma  = new PrismaClient({ adapter });

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
async function addRolePermIfMissing(roleId: number, permId: number) {
  const exists = await prisma.tbl_role_permission.findFirst({
    where: { role_id: roleId, permission_id: permId },
    select: { role_permission_id: true },
  });
  if (!exists) {
    await prisma.tbl_role_permission.create({ data: { role_id: roleId, permission_id: permId } });
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('🌱  Starting essentials seed…');

  // -------------------------------------------------------------------------
  // 1. ROLES
  // -------------------------------------------------------------------------
  console.log('  • roles');
  const roleStudent  = await prisma.tbl_role.upsert({ where: { role_name: 'Student'           }, update: {}, create: { role_name: 'Student',            is_approver: false, hierarchy_order: null } });
  const roleAdviser  = await prisma.tbl_role.upsert({ where: { role_name: 'Adviser'           }, update: {}, create: { role_name: 'Adviser',            is_approver: true,  hierarchy_order: 1    } });
  const roleProgChair = await prisma.tbl_role.upsert({ where: { role_name: 'Program Chair'    }, update: {}, create: { role_name: 'Program Chair',       is_approver: true,  hierarchy_order: 2    } });
  const roleSDO      = await prisma.tbl_role.upsert({ where: { role_name: 'SDAO'              }, update: {}, create: { role_name: 'SDAO',                is_approver: true,  hierarchy_order: 5    } });
  const roleDean     = await prisma.tbl_role.upsert({ where: { role_name: 'Dean'              }, update: {}, create: { role_name: 'Dean',                is_approver: true,  hierarchy_order: 3    } });
  const roleAcadDir  = await prisma.tbl_role.upsert({ where: { role_name: 'Academic Director' }, update: {}, create: { role_name: 'Academic Director',   is_approver: true,  hierarchy_order: 4    } });
  const roleFaculty  = await prisma.tbl_role.upsert({ where: { role_name: 'Faculty'           }, update: {}, create: { role_name: 'Faculty',             is_approver: false, hierarchy_order: null } });

  const rolesById = [roleStudent, roleAdviser, roleProgChair, roleSDO, roleDean, roleAcadDir, roleFaculty];

  // -------------------------------------------------------------------------
  // 2. PERMISSIONS
  // -------------------------------------------------------------------------
  console.log('  • permissions');
  const permDefs = [
    { permission_name: 'CREATE_EVENT',              scope: 'Organization' as const }, // 1
    { permission_name: 'UPDATE_EVENT',              scope: 'Organization' as const }, // 2
    { permission_name: 'DELETE_EVENT',              scope: 'Organization' as const }, // 3
    { permission_name: 'VIEW_EVENT',                scope: 'Global'       as const }, // 4
    { permission_name: 'REGISTER_EVENT',            scope: 'Organization' as const }, // 5
    { permission_name: 'APPLY_ORGANIZATION',        scope: 'Organization' as const }, // 6
    { permission_name: 'APPROVE_ORGANIZATION',      scope: 'Approver'     as const }, // 7
    { permission_name: 'ARCHIVE_ORGANIZATION',      scope: 'SDAO'         as const }, // 8
    { permission_name: 'VIEW_ORGANIZATION',         scope: 'Global'       as const }, // 9
    { permission_name: 'MANAGE_ACCOUNT',            scope: 'SDAO'         as const }, // 10
    { permission_name: 'CREATE_COMMITTEE',          scope: 'Organization' as const }, // 11
    { permission_name: 'UPDATE_COMMITTEE',          scope: 'Organization' as const }, // 12
    { permission_name: 'DELETE_COMMITTEE',          scope: 'Organization' as const }, // 13
    { permission_name: 'VIEW_COMMITTEE',            scope: 'Organization' as const }, // 14
    { permission_name: 'MANAGE_REQUIREMENTS',       scope: 'SDAO'         as const }, // 15
    { permission_name: 'VIEW_APPLICATION',          scope: 'Approver'     as const }, // 16
    { permission_name: 'MANAGE_APPLICATIONS',       scope: 'SDAO'         as const }, // 17
    { permission_name: 'CREATE_EVALUATION',         scope: 'Organization' as const }, // 18
    { permission_name: 'UPDATE_EVALUATION',         scope: 'Organization' as const }, // 19
    { permission_name: 'DELETE_EVALUATION',         scope: 'Organization' as const }, // 20
    { permission_name: 'VIEW_EVALUATION',           scope: 'Organization' as const }, // 21
    { permission_name: 'VIEW_LOGS',                 scope: 'Global'       as const }, // 22
    { permission_name: 'WEB_ACCESS',                scope: 'Global'       as const }, // 23
    { permission_name: 'MANAGE_REGISTRATION',       scope: 'SDAO'         as const }, // 24
    { permission_name: 'SUBMIT_REQUIREMENTS',       scope: 'Global'       as const }, // 25
    { permission_name: 'MANAGE_PROGRAMS',           scope: 'SDAO'         as const }, // 26
    { permission_name: 'CREATE_SDAO_EVENT',         scope: 'SDAO'         as const }, // 27
    { permission_name: 'APPLY_NEW_ORGANIZATION',    scope: 'Global'       as const }, // 28
    { permission_name: 'APPLY_RENEWAL_ORGANIZATION',scope: 'Organization' as const }, // 29
    { permission_name: 'VIEW_TRANSACTIONS',         scope: 'Global'       as const }, // 30
    { permission_name: 'MANAGE_TRANSACTIONS',       scope: 'Organization' as const }, // 31
    { permission_name: 'MANAGE_SDAO_EVENT',         scope: 'SDAO'         as const }, // 32
    { permission_name: 'MANAGE_COLLEGES',           scope: 'SDAO'         as const }, // 33
    { permission_name: 'SCAN_QR',                   scope: 'Organization' as const }, // 34
    { permission_name: 'MANAGE_TERM_PAYMENTS',      scope: 'Organization' as const }, // 35
    { permission_name: 'CREATE_OFFICER',            scope: 'Organization' as const }, // 36
    { permission_name: 'UPDATE_OFFICER',            scope: 'Organization' as const }, // 37
    { permission_name: 'ARCHIVE_OFFICER',           scope: 'Organization' as const }, // 38
    { permission_name: 'CREATE_COMMITTEE_MEMBER',   scope: 'Organization' as const }, // 39
    { permission_name: 'ARCHIVE_COMMITTEE_MEMBER',  scope: 'Organization' as const }, // 40
    { permission_name: 'ARCHIVE_MEMBERS',           scope: 'Organization' as const }, // 41
    { permission_name: 'MANAGE_ORG_ROLES',           scope: 'Organization' as const }, // 42
  ];

  const permissions: Record<string, number> = {};
  const permById: number[] = [];

  for (const def of permDefs) {
    const p = await prisma.tbl_permission.upsert({
      where:  { permission_name: def.permission_name },
      update: {},
      create: def,
    });
    permissions[def.permission_name] = p.permission_id;
    permById.push(p.permission_id);
  }

  // -------------------------------------------------------------------------
  // 3. ROLE ↔ PERMISSION MAPPING
  // -------------------------------------------------------------------------
  console.log('  • role permissions');
  const r = (i: number) => rolesById[i - 1].role_id;
  const p = (i: number) => permById[i - 1];

  const rolePermPairs: [number, number][] = [
    // SDAO (role 4)
    [r(4), p(2)],  [r(4), p(3)],  [r(4), p(4)],  [r(4), p(7)],
    [r(4), p(8)],  [r(4), p(9)],  [r(4), p(10)], [r(4), p(11)],
    [r(4), p(12)], [r(4), p(13)], [r(4), p(14)], [r(4), p(15)],
    [r(4), p(17)], [r(4), p(19)], [r(4), p(21)], [r(4), p(22)],
    [r(4), p(23)], [r(4), p(24)], [r(4), p(25)], [r(4), p(26)],
    [r(4), p(27)], [r(4), p(30)], [r(4), p(32)], [r(4), p(33)],
    // Adviser (role 2)
    [r(2), p(1)],  [r(2), p(6)],  [r(2), p(9)],  [r(2), p(14)],
    [r(2), p(16)], [r(2), p(17)], [r(2), p(21)], [r(2), p(22)],
    [r(2), p(23)], [r(2), p(28)], [r(2), p(30)], [r(2), p(31)],
    // Program Chair (role 3)
    [r(3), p(17)], [r(3), p(23)], [r(3), p(9)],  [r(3), p(16)], [r(3), p(4)],
    // Dean (role 5)
    [r(5), p(17)], [r(5), p(23)], [r(5), p(9)],  [r(5), p(16)], [r(5), p(4)],
    // Academic Director (role 6)
    [r(6), p(17)], [r(6), p(23)], [r(6), p(9)],  [r(6), p(16)], [r(6), p(4)],
    // Faculty (role 7)
    [r(7), p(23)], [r(7), p(9)],  [r(7), p(4)],
  ];

  for (const [roleId, permId] of rolePermPairs) {
    await addRolePermIfMissing(roleId, permId);
  }

  // -------------------------------------------------------------------------
  // 4. EXECUTIVE RANKS
  // -------------------------------------------------------------------------
  console.log('  • executive ranks');
  const execRankDefs = [
    { rank_level: 1, default_title: 'President',                  description: 'Highest authority with full permissions'              },
    { rank_level: 2, default_title: 'Vice President Internal',    description: 'Handles internal organizational matters'              },
    { rank_level: 3, default_title: 'Vice President External',    description: 'Handles external partnerships and representation'     },
    { rank_level: 4, default_title: 'Secretary',                  description: 'Administrative lead'                                  },
    { rank_level: 5, default_title: 'Treasurer',                  description: 'Financial manager'                                    },
    { rank_level: 6, default_title: 'Auditor',                    description: 'Responsible for auditing and financial oversight'     },
    { rank_level: 7, default_title: 'Public Information Officer', description: 'Handles publicity and information dissemination'      },
    { rank_level: 8, default_title: 'Officer',                    description: 'General executive member'                            },
  ];

  const execRanks: Record<number, number> = {};
  for (const def of execRankDefs) {
    const rank = await prisma.tbl_executive_rank.upsert({
      where:  { rank_level: def.rank_level },
      update: {},
      create: def,
    });
    execRanks[def.rank_level] = rank.rank_id;
  }

  // -------------------------------------------------------------------------
  // 5. RANK PERMISSIONS  (President — rank_level 1)
  //    Perm indices (1-based): 1,9,16,11,12,13,14,23,4,24,25,17,19,20,21,22,29,31,34,35,36,37,38,39,40,41,42
  // -------------------------------------------------------------------------
  console.log('  • rank permissions');
  const presidentRankPermIds = [1,9,16,11,12,13,14,23,4,24,25,17,19,20,21,22,29,31,34,35,36,37,38,39,40,41,42];
  for (const permIdx of presidentRankPermIds) {
    await prisma.tbl_rank_permission.upsert({
      where:  { rank_id_permission_id: { rank_id: execRanks[1], permission_id: permById[permIdx - 1] } },
      update: {},
      create: { rank_id: execRanks[1], permission_id: permById[permIdx - 1] },
    });
  }

  // -------------------------------------------------------------------------
  // 6. COLLEGES
  // -------------------------------------------------------------------------
  console.log('  • colleges');
  const collegeDefs = [
    { name: 'School of Arts, Sciences, and Education',           abbreviation: 'SASE' },
    { name: 'School of Business, Management, and Accountancy',   abbreviation: 'SBMA' },
    { name: 'School of Engineering, Computing and Architecture', abbreviation: 'SECA' },
  ];

  const colleges: Record<string, number> = {};
  for (const def of collegeDefs) {
    const c = await prisma.tbl_college.upsert({
      where:  { abbreviation: def.abbreviation },
      update: {},
      create: { ...def, status: 'Active' },
    });
    colleges[def.abbreviation] = c.college_id;
  }

  // -------------------------------------------------------------------------
  // 7. PROGRAMS``
  // -------------------------------------------------------------------------
  console.log('  • programs');
  const programDefs: Array<{ college: string; name: string; abbreviation: string }> = [
    // SASE
    { college: 'SASE', name: 'Bachelor of Science in Physical Education',                                                              abbreviation: 'BPEd'         },
    { college: 'SASE', name: 'Bachelor of Arts in Communication',                                                                      abbreviation: 'ABComm'       },
    { college: 'SASE', name: 'Bachelor of Science in Psychology',                                                                      abbreviation: 'BSPSY'        },
    // SBMA
    { college: 'SBMA', name: 'Bachelor of Science in Hospitality Management',                                                          abbreviation: 'BSHM'         },
    { college: 'SBMA', name: 'Bachelor of Science in Business Administration major in Human Resource Management',                      abbreviation: 'BSBA-HRM'     },
    { college: 'SBMA', name: 'Master of Management',                                                                                   abbreviation: 'MM'           },
    { college: 'SBMA', name: 'Bachelor of Science in Business Administration major in Financial Management',                           abbreviation: 'BSBA-FinMgt'  },
    { college: 'SBMA', name: 'Bachelor of Science in Business Administration major in Marketing Management',                           abbreviation: 'BSBA-MktgMgt' },
    { college: 'SBMA', name: 'Bachelor of Science in Tourism Management',                                                              abbreviation: 'BSTM'         },
    { college: 'SBMA', name: 'Bachelor of Science in Accountancy',                                                                     abbreviation: 'BSAccountancy'},
    { college: 'SBMA', name: 'Bachelor of Science in Management Accounting',                                                           abbreviation: 'BSMA'         },
    // SECA
    { college: 'SECA', name: 'Bachelor of Science in Computer Engineering',                                                            abbreviation: 'BSCpE'        },
    { college: 'SECA', name: 'Bachelor of Science in Information Technology with a specialization in Mobile and Web Applications',     abbreviation: 'BSIT-MWA'    },
    { college: 'SECA', name: 'Bachelor of Science in Civil Engineering',                                                               abbreviation: 'BSCE'         },
    { college: 'SECA', name: 'Bachelor of Science in Architecture',                                                                    abbreviation: 'BSArch'       },
    { college: 'SECA', name: 'Bachelor of Science in Computer Science with specialization in Machine Learning',                        abbreviation: 'BSCS-ML'      },
  ];

  const programs: Record<string, number> = {};
  for (const def of programDefs) {
    const prog = await prisma.tbl_program.upsert({
      where:  { abbreviation: def.abbreviation },
      update: {},
      create: { college_id: colleges[def.college], name: def.name, abbreviation: def.abbreviation, status: 'Active' },
    });
    programs[def.abbreviation] = prog.program_id;
  }

  // -------------------------------------------------------------------------
  // 8. SECTIONS
  // -------------------------------------------------------------------------
  console.log('  • sections');
  const csSections = ['COM251','COM252','COM253','COM241','COM242','COM231','COM232','COM221'];
  const itSections = [
    'INF251','INF252','INF253','INF254','INF255',
    'INF241','INF242','INF243','INF244','INF245','INF246',
    'INF231','INF232','INF233','INF234',
    'INF221','INF222','INF223','INF224',
  ];

  for (const sectionName of csSections) {
    await prisma.tbl_section.upsert({
      where:  { program_id_section_name: { program_id: programs['BSCS-ML'], section_name: sectionName } },
      update: {},
      create: { program_id: programs['BSCS-ML'], section_name: sectionName, is_active: true },
    });
  }
  for (const sectionName of itSections) {
    await prisma.tbl_section.upsert({
      where:  { program_id_section_name: { program_id: programs['BSIT-MWA'], section_name: sectionName } },
      update: {},
      create: { program_id: programs['BSIT-MWA'], section_name: sectionName, is_active: true },
    });
  }

  // -------------------------------------------------------------------------
  // 10. APPLICATION REQUIREMENTS (organizations)
  // -------------------------------------------------------------------------
  console.log('  • application requirements');
  const existingOrgReqs = await prisma.tbl_application_requirement.count();
  if (existingOrgReqs === 0) {
    const orgReqDefs = [
      { requirement_name: 'Letter of Intent',                                                                  is_applicable_to: 'new'   as const },
      { requirement_name: 'By Laws of the Organization',                                                       is_applicable_to: 'both'  as const },
      { requirement_name: 'List of Officers/Founders',                                                         is_applicable_to: 'both'  as const },
      { requirement_name: 'Letter from the College Dean/Department Chair endorsing the Faculty Adviser',       is_applicable_to: 'both'  as const },
      { requirement_name: 'List of Members',                                                                   is_applicable_to: 'both'  as const },
      { requirement_name: 'Latest Certificate of Grades of Officers',                                          is_applicable_to: 'both'  as const },
      { requirement_name: 'Biodata/CV of Officers',                                                            is_applicable_to: 'both'  as const },
      { requirement_name: 'Resume/CV of Adviser',                                                              is_applicable_to: 'new'   as const },
      { requirement_name: 'List of Proposed Projects with Proposed Budget for the AY',                         is_applicable_to: 'both'  as const },
      { requirement_name: 'List of Past Projects',                                                             is_applicable_to: 'renew' as const },
      { requirement_name: 'Financial Statement of the Previous AY (Signed by Officers and Adviser)',           is_applicable_to: 'renew' as const },
      { requirement_name: 'Summary of Evaluation of the Past Projects',                                        is_applicable_to: 'renew' as const },
    ];
    for (const def of orgReqDefs) {
      await prisma.tbl_application_requirement.create({ data: { ...def, created_by: null } });
    }
  }

  // -------------------------------------------------------------------------
  // 11. EVENT APPLICATION REQUIREMENTS
  // -------------------------------------------------------------------------
  console.log('  • event application requirements');
  const existingEventReqs = await prisma.tbl_event_application_requirement.count();
  if (existingEventReqs === 0) {
    const eventReqDefs = [
      { requirement_name: 'Event Proposal/Concept Paper',    is_applicable_to: 'pre_event'  as const },
      { requirement_name: 'Event Budget Proposal',           is_applicable_to: 'pre_event'  as const },
      { requirement_name: 'Permission Letter / MOU',         is_applicable_to: 'pre_event'  as const },
      { requirement_name: 'Event Post-Activity Report',      is_applicable_to: 'post_event' as const },
      { requirement_name: 'Financial Liquidation Report',    is_applicable_to: 'post_event' as const },
      { requirement_name: 'Certificate of Attendance',       is_applicable_to: 'post_event' as const },
      { requirement_name: 'Attendance Sheet',                is_applicable_to: 'post_event' as const },
      { requirement_name: 'Documentation Photos (compiled)', is_applicable_to: 'post_event' as const },
    ];
    for (const def of eventReqDefs) {
      await prisma.tbl_event_application_requirement.create({ data: { ...def, status: 'active', created_by: null } });
    }
  }

  // -------------------------------------------------------------------------
  // 12. EVALUATION QUESTION GROUPS + QUESTIONS
  // -------------------------------------------------------------------------
  console.log('  • evaluation questions');
  const existingEvalGroups = await prisma.tbl_evaluation_question_group.count();
  if (existingEvalGroups === 0) {
    const evalGroups = [
      {
        group_title: 'Activity: Meeting/Seminar/Conference/Workshop/Quiz Bee/Competition/Sport fest, etc.',
        group_description: 'Question about activities',
        questions: [
          { text: 'Is the activity relevant/important to you?',                                                  type: 'likert_4' as const },
          { text: 'Is the program relevant to the course/you\'re in?',                                           type: 'likert_4' as const },
          { text: 'Were the objectives clear and communicated before the activity?',                             type: 'likert_4' as const },
          { text: 'Were the objectives met by the activity?',                                                    type: 'likert_4' as const },
          { text: 'Was the venue proper for this kind of activity?',                                             type: 'likert_4' as const },
          { text: 'Did the activity start and end on time?',                                                     type: 'likert_4' as const },
          { text: 'Did the organizers maintain an orderly environment all throughout the activity?',              type: 'likert_4' as const },
          { text: 'Was the event/activity well-advertised/properly announce?',                                   type: 'likert_4' as const },
          { text: 'Would you recommend this activity to your classmates/friends?',                               type: 'likert_4' as const },
          { text: 'Do you want an activity like this to happen more often?',                                     type: 'likert_4' as const },
          { text: 'Overall evaluation',                                                                          type: 'likert_4' as const },
        ],
      },
      {
        group_title: 'About the Speaker/Resource person',
        group_description: 'Feedback about event speakers/presenters',
        questions: [
          { text: 'Was the speaker well-prepared and knowledgeable on the topic?',                               type: 'likert_4' as const },
          { text: 'Did the speaker use different and appropriate methods in delivering the topic?',               type: 'likert_4' as const },
          { text: 'Was the speaker able to connect with the audience and catch their attention?',                 type: 'likert_4' as const },
        ],
      },
      {
        group_title: 'Meals',
        group_description: 'Feedback about meals',
        questions: [
          { text: 'Were the meals/snacks provided enough to fill you?',                                          type: 'likert_4' as const },
          { text: 'Did the meals/snacks have a pleasant taste?',                                                 type: 'likert_4' as const },
        ],
      },
      {
        group_title: 'Handouts',
        group_description: 'Feedback about handouts',
        questions: [
          { text: 'Are the handouts provided useful?',                                                           type: 'likert_4' as const },
          { text: 'Is the printing of the handouts clear?',                                                      type: 'likert_4' as const },
        ],
      },
      {
        group_title: 'Transportation',
        group_description: 'Feedback about transportation',
        questions: [
          { text: 'Did you feel safe during the travel to the venue?',                                           type: 'likert_4' as const },
          { text: 'Did you feel that the transportation provided is in good running condition?',                  type: 'likert_4' as const },
          { text: 'Did you feel safe with the driver\'s skills?',                                                type: 'likert_4' as const },
        ],
      },
      {
        group_title: 'Comments and Suggestions',
        group_description: 'Feedback about the whole event',
        questions: [
          { text: 'What important knowledge or information did you gain from this activity?',                     type: 'textbox' as const },
          { text: 'What did you like most about the activity?',                                                  type: 'textbox' as const },
          { text: 'What did you like least about the activity?',                                                 type: 'textbox' as const },
          { text: 'Any other comments/suggestions for further improvement the activity?',                        type: 'textbox' as const },
        ],
      },
    ];

    for (const grp of evalGroups) {
      const g = await prisma.tbl_evaluation_question_group.create({
        data: { group_title: grp.group_title, group_description: grp.group_description, is_active: true },
      });
      for (const q of grp.questions) {
        await prisma.tbl_evaluation_question.create({
          data: { group_id: g.group_id, question_text: q.text, question_type: q.type, is_required: true },
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // 13. FINANCIAL CATEGORIES
  // -------------------------------------------------------------------------
  console.log('  • financial categories');
  const catIncome  = await prisma.tbl_financial_category.upsert({ where: { code: 'INCOME'  }, update: {}, create: { code: 'INCOME',  label: 'Income',  kind: 'INCOME',  active: true } });
  const catExpense = await prisma.tbl_financial_category.upsert({ where: { code: 'EXPENSE' }, update: {}, create: { code: 'EXPENSE', label: 'Expense', kind: 'EXPENSE', active: true } });

  const financialSubCats = [
    { code: 'MEMBERSHIP_FEE', label: 'Membership Fee',          kind: 'INCOME'  as const, parent: catIncome.category_id  },
    { code: 'EVENT_FEE',      label: 'Event Registration Fee',  kind: 'INCOME'  as const, parent: catIncome.category_id  },
    { code: 'DONATION',       label: 'Donations / Sponsorship', kind: 'INCOME'  as const, parent: catIncome.category_id  },
    { code: 'FUND_RAISE',     label: 'Fundraising',             kind: 'INCOME'  as const, parent: catIncome.category_id  },
    { code: 'EVENT_EXP',      label: 'Event Expenses',          kind: 'EXPENSE' as const, parent: catExpense.category_id },
    { code: 'SUPPLIES',       label: 'Office Supplies',         kind: 'EXPENSE' as const, parent: catExpense.category_id },
    { code: 'FOOD',           label: 'Food and Beverages',      kind: 'EXPENSE' as const, parent: catExpense.category_id },
    { code: 'TRANSPORT',      label: 'Transportation',          kind: 'EXPENSE' as const, parent: catExpense.category_id },
    { code: 'PRINTING',       label: 'Printing and Publishing', kind: 'EXPENSE' as const, parent: catExpense.category_id },
    { code: 'MISC',           label: 'Miscellaneous',           kind: 'EXPENSE' as const, parent: catExpense.category_id },
  ];

  const finCats: Record<string, number> = {
    INCOME: catIncome.category_id, EXPENSE: catExpense.category_id,
  };
  for (const def of financialSubCats) {
    const c = await prisma.tbl_financial_category.upsert({
      where:  { code: def.code },
      update: {},
      create: { code: def.code, label: def.label, kind: def.kind, parent_category_id: def.parent, active: true },
    });
    finCats[def.code] = c.category_id;
  }

  // -------------------------------------------------------------------------
  // 14. TRANSACTION TYPES
  // -------------------------------------------------------------------------
  console.log('  • transaction types');
  const txnTypeDefs = [
    { code: 'MEMBERSHIP', label: 'Membership Payment' },
    { code: 'EVENT',      label: 'Event Registration' },
    { code: 'FINE',       label: 'Fine / Penalty'     },
    { code: 'OTHER',      label: 'Other Income'       },
  ];
  const txnTypes: Record<string, number> = {};
  for (const def of txnTypeDefs) {
    const t = await prisma.tbl_transaction_type.upsert({ where: { code: def.code }, update: {}, create: def });
    txnTypes[def.code] = t.transaction_type_id;
  }

  // -------------------------------------------------------------------------
  // 15. PAYMENT TYPES
  // -------------------------------------------------------------------------
  console.log('  • payment types');
  const payTypeDefs = [
    { code: 'CASH',   label: 'Cash',           method_group: 'OTC'     },
    { code: 'GCASH',  label: 'GCash',          method_group: 'EWALLET' },
    { code: 'MAYA',   label: 'Maya (PayMaya)', method_group: 'EWALLET' },
    { code: 'BANK',   label: 'Bank Transfer',  method_group: 'BANK'    },
    { code: 'ONLINE', label: 'Online Payment', method_group: 'ONLINE'  },
  ];
  for (const def of payTypeDefs) {
    await prisma.tbl_payment_type.upsert({ where: { code: def.code }, update: {}, create: def });
  }

  // -------------------------------------------------------------------------
  // 16. TRANSACTION TYPE ↔ CATEGORY
  // -------------------------------------------------------------------------
  console.log('  • transaction type ↔ category');
  const txnTypeCatMap: Array<[string, string]> = [
    ['MEMBERSHIP', 'MEMBERSHIP_FEE'],
    ['EVENT',      'EVENT_FEE'],
    ['FINE',       'MISC'],
    ['OTHER',      'DONATION'],
  ];
  for (const [typeCode, catCode] of txnTypeCatMap) {
    await prisma.tbl_transaction_type_category.upsert({
      where: { transaction_type_id_category_id: { transaction_type_id: txnTypes[typeCode], category_id: finCats[catCode] } },
      update: {},
      create: { transaction_type_id: txnTypes[typeCode], category_id: finCats[catCode] },
    });
  }

  // -------------------------------------------------------------------------
  // 17. RECEIPT SEQUENCES
  // -------------------------------------------------------------------------
  console.log('  • receipt sequences');
  await prisma.tbl_receipt_sequence.upsert({ where: { series_key: 'MEMBERSHIP' }, update: {}, create: { series_key: 'MEMBERSHIP', prefix: 'MEM', pad_length: 6, current_value: 0 } });
  await prisma.tbl_receipt_sequence.upsert({ where: { series_key: 'EVENT'      }, update: {}, create: { series_key: 'EVENT',      prefix: 'EVT', pad_length: 6, current_value: 0 } });
  await prisma.tbl_receipt_sequence.upsert({ where: { series_key: 'GENERAL'    }, update: {}, create: { series_key: 'GENERAL',    prefix: 'RCT', pad_length: 6, current_value: 0 } });

  // -------------------------------------------------------------------------
  // 18. ACADEMIC TERMS
  //     Three terms for AY 2025-2026. Update dates each academic year.
  // -------------------------------------------------------------------------
  console.log('  • academic terms');
  const academicTermDefs = [
    {
      term_name:        'AY 2025-2026 1st Term',
      term_description: 'First term of Academic Year 2025-2026',
      academic_year:    '2025-2026',
      start_date:       new Date('2025-07-14'),
      end_date:         new Date('2025-11-07'),
    },
    {
      term_name:        'AY 2025-2026 2nd Term',
      term_description: 'Second term of Academic Year 2025-2026',
      academic_year:    '2025-2026',
      start_date:       new Date('2025-11-24'),
      end_date:         new Date('2026-03-20'),
    },
    {
      term_name:        'AY 2025-2026 Summer',
      term_description: 'Summer term of Academic Year 2025-2026',
      academic_year:    '2025-2026',
      start_date:       new Date('2026-04-06'),
      end_date:         new Date('2026-05-29'),
    },
  ];

  for (const def of academicTermDefs) {
    await prisma.tbl_academic_term.upsert({
      where:  { term_name: def.term_name },
      update: {},
      create: { ...def, created_by: null },
    });
  }

  // -------------------------------------------------------------------------
  // Done
  // -------------------------------------------------------------------------
  console.log('\n✅  Essentials seed complete.');
  console.log(`    Roles:                   ${await prisma.tbl_role.count()}`);
  console.log(`    Permissions:             ${await prisma.tbl_permission.count()}`);
  console.log(`    Colleges:                ${await prisma.tbl_college.count()}`);
  console.log(`    Programs:                ${await prisma.tbl_program.count()}`);
  console.log(`    App requirements:        ${await prisma.tbl_application_requirement.count()}`);
  console.log(`    Event requirements:      ${await prisma.tbl_event_application_requirement.count()}`);
  console.log(`    Eval question groups:    ${await prisma.tbl_evaluation_question_group.count()}`);
  console.log(`    Financial categories:    ${await prisma.tbl_financial_category.count()}`);
  console.log(`    Transaction types:       ${await prisma.tbl_transaction_type.count()}`);
  console.log(`    Academic terms:          ${await prisma.tbl_academic_term.count()}`);
}

main()
  .catch((e) => {
    console.error('❌  Essentials seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
