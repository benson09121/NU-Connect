import 'dotenv/config';
import { faker } from '@faker-js/faker';
import { PrismaClient } from '../lib/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
})

const prisma = new PrismaClient({ adapter });

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function addRolePermIfMissing(roleId: number, permId: number) {
  const exists = await prisma.tbl_role_permission.findFirst({
    where: { role_id: roleId, permission_id: permId },
    select: { role_permission_id: true },
  });
  if (!exists) {
    await prisma.tbl_role_permission.create({
      data: { role_id: roleId, permission_id: permId },
    });
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('🌱  Starting seed…');

  // -------------------------------------------------------------------------
  // 1. ROLES
  // -------------------------------------------------------------------------
  console.log('  • roles');
  const roleStudent = await prisma.tbl_role.upsert({
    where: { role_name: 'Student' },
    update: {},
    create: { role_name: 'Student', is_approver: false, hierarchy_order: null },
  });
  const roleAdviser = await prisma.tbl_role.upsert({
    where: { role_name: 'Adviser' },
    update: {},
    create: { role_name: 'Adviser', is_approver: true, hierarchy_order: 1 },
  });
  const roleProgChair = await prisma.tbl_role.upsert({
    where: { role_name: 'Program Chair' },
    update: {},
    create: { role_name: 'Program Chair', is_approver: true, hierarchy_order: 2 },
  });
  const roleSDO = await prisma.tbl_role.upsert({
    where: { role_name: 'SDAO' },
    update: {},
    create: { role_name: 'SDAO', is_approver: true, hierarchy_order: 5 },
  });
  const roleDean = await prisma.tbl_role.upsert({
    where: { role_name: 'Dean' },
    update: {},
    create: { role_name: 'Dean', is_approver: true, hierarchy_order: 3 },
  });
  const roleAcadDir = await prisma.tbl_role.upsert({
    where: { role_name: 'Academic Director' },
    update: {},
    create: { role_name: 'Academic Director', is_approver: true, hierarchy_order: 4 },
  });
  const roleFaculty = await prisma.tbl_role.upsert({
    where: { role_name: 'Faculty' },
    update: {},
    create: { role_name: 'Faculty', is_approver: false, hierarchy_order: null },
  });

  // Ordered array for index-based role_permission mapping (matches SQL insertion order)
  const rolesById = [roleStudent, roleAdviser, roleProgChair, roleSDO, roleDean, roleAcadDir, roleFaculty];

  // -------------------------------------------------------------------------
  // 2. PERMISSIONS
  // -------------------------------------------------------------------------
  console.log('  • permissions');
  const permDefs = [
    { permission_name: 'CREATE_EVENT', scope: 'Organization' as const }, // 1
    { permission_name: 'UPDATE_EVENT', scope: 'Organization' as const }, // 2
    { permission_name: 'DELETE_EVENT', scope: 'Organization' as const }, // 3
    { permission_name: 'VIEW_EVENT', scope: 'Global' as const }, // 4
    { permission_name: 'REGISTER_EVENT', scope: 'Organization' as const }, // 5
    { permission_name: 'APPLY_ORGANIZATION', scope: 'Organization' as const }, // 6
    { permission_name: 'APPROVE_ORGANIZATION', scope: 'Approver' as const }, // 7
    { permission_name: 'ARCHIVE_ORGANIZATION', scope: 'SDAO' as const }, // 8
    { permission_name: 'VIEW_ORGANIZATION', scope: 'Global' as const }, // 9
    { permission_name: 'MANAGE_ACCOUNT', scope: 'SDAO' as const }, // 10
    { permission_name: 'CREATE_COMMITTEE', scope: 'Organization' as const }, // 11
    { permission_name: 'UPDATE_COMMITTEE', scope: 'Organization' as const }, // 12
    { permission_name: 'DELETE_COMMITTEE', scope: 'Organization' as const }, // 13
    { permission_name: 'VIEW_COMMITTEE', scope: 'Organization' as const }, // 14
    { permission_name: 'MANAGE_REQUIREMENTS', scope: 'SDAO' as const }, // 15
    { permission_name: 'VIEW_APPLICATION', scope: 'Approver' as const }, // 16
    { permission_name: 'MANAGE_APPLICATIONS', scope: 'SDAO' as const }, // 17
    { permission_name: 'CREATE_EVALUATION', scope: 'Organization' as const }, // 18
    { permission_name: 'UPDATE_EVALUATION', scope: 'Organization' as const }, // 19
    { permission_name: 'DELETE_EVALUATION', scope: 'Organization' as const }, // 20
    { permission_name: 'VIEW_EVALUATION', scope: 'Organization' as const }, // 21
    { permission_name: 'VIEW_LOGS', scope: 'Global' as const }, // 22
    { permission_name: 'WEB_ACCESS', scope: 'Global' as const }, // 23
    { permission_name: 'MANAGE_REGISTRATION', scope: 'SDAO' as const }, // 24
    { permission_name: 'SUBMIT_REQUIREMENTS', scope: 'Global' as const }, // 25
    { permission_name: 'MANAGE_PROGRAMS', scope: 'SDAO' as const }, // 26
    { permission_name: 'CREATE_SDAO_EVENT', scope: 'SDAO' as const }, // 27
    { permission_name: 'APPLY_NEW_ORGANIZATION', scope: 'Global' as const }, // 28
    { permission_name: 'APPLY_RENEWAL_ORGANIZATION', scope: 'Organization' as const }, // 29
    { permission_name: 'VIEW_TRANSACTIONS', scope: 'Global' as const }, // 30
    { permission_name: 'MANAGE_TRANSACTIONS', scope: 'Organization' as const }, // 31
    { permission_name: 'MANAGE_SDAO_EVENT', scope: 'SDAO' as const }, // 32
    { permission_name: 'MANAGE_COLLEGES', scope: 'SDAO' as const }, // 33
    { permission_name: 'SCAN_QR', scope: 'Organization' as const }, // 34
    { permission_name: 'MANAGE_TERM_PAYMENTS', scope: 'Organization' as const }, // 35
    { permission_name: 'CREATE_OFFICER', scope: 'Organization' as const }, // 36
    { permission_name: 'UPDATE_OFFICER', scope: 'Organization' as const }, // 37
    { permission_name: 'ARCHIVE_OFFICER', scope: 'Organization' as const }, // 38
    { permission_name: 'CREATE_COMMITTEE_MEMBER', scope: 'Organization' as const }, // 39
    { permission_name: 'ARCHIVE_COMMITTEE_MEMBER', scope: 'Organization' as const }, // 40
    { permission_name: 'ARCHIVE_MEMBERS', scope: 'Organization' as const }, // 41
    { permission_name: 'MANAGE_ORG_ROLES', scope: 'Organization' as const }, // 42
    { permission_name: 'CREATE_EVENT_REQUIREMENT', scope: 'SDAO' as const }, // 43
    { permission_name: 'UPDATE_EVENT_REQUIREMENT', scope: 'SDAO' as const }, // 44
    { permission_name: 'ARCHIVE_EVENT_REQUIREMENT', scope: 'SDAO' as const }, // 45
    { permission_name: 'SUBMIT_REPORT', scope: 'Organization' as const }, // 46
    { permission_name: 'CREATE_TRANSACTION', scope: 'Organization' as const }, // 47
    { permission_name: 'UPDATE_TRANSACTION', scope: 'Organization' as const }, // 48
    { permission_name: 'ARCHIVE_TRANSACTION', scope: 'Organization' as const }, // 49
    { permission_name: 'APPROVE_TRANSACTION', scope: 'Organization' as const }, // 50
    { permission_name: 'VIEW_ANALYTICS', scope: 'Global' as const }, // 51
  ];

  // permissions map: name → db id  (for other parts of the seed)
  const permissions: Record<string, number> = {};
  // permById[i] = db permission_id of the (i+1)-th permission (matches SQL 1-based ids)
  const permById: number[] = [];

  for (const def of permDefs) {
    const p = await prisma.tbl_permission.upsert({
      where: { permission_name: def.permission_name },
      update: {},
      create: def,
    });
    permissions[def.permission_name] = p.permission_id;
    permById.push(p.permission_id);
  }

  // -------------------------------------------------------------------------
  // 3. ROLE ↔ PERMISSION MAPPING
  //    Pairs are [roleIndex (1-based), permIndex (1-based)] matching the SQL
  // -------------------------------------------------------------------------
  console.log('  • role permissions');

  // Helper: r(i) and p(i) convert 1-based SQL indices to db ids
  const r = (i: number) => rolesById[i - 1].role_id;
  const p = (i: number) => permById[i - 1];

  const rolePermPairs: [number, number][] = [
    // SDAO (role 4): 2,3,4,7,8,9,10,11,12,13,14,15,17,19,21,22,23,24,25,26,27,30,32,33,43,44,45
    [r(4), p(2)], [r(4), p(3)], [r(4), p(4)], [r(4), p(7)],
    [r(4), p(8)], [r(4), p(9)], [r(4), p(10)], [r(4), p(11)],
    [r(4), p(12)], [r(4), p(13)], [r(4), p(14)], [r(4), p(15)],
    [r(4), p(17)], [r(4), p(19)], [r(4), p(21)], [r(4), p(22)],
    [r(4), p(23)], [r(4), p(24)], [r(4), p(25)], [r(4), p(26)],
    [r(4), p(27)], [r(4), p(30)], [r(4), p(32)], [r(4), p(33)],
    [r(4), p(43)], [r(4), p(44)], [r(4), p(45)], [r(4), p(51)],
    // Adviser (role 2): 1,6,9,14,16,17,21,22,23,28,30,31
    [r(2), p(1)], [r(2), p(6)], [r(2), p(9)], [r(2), p(14)],
    [r(2), p(16)], [r(2), p(17)], [r(2), p(21)], [r(2), p(22)],
    [r(2), p(23)], [r(2), p(28)], [r(2), p(30)], [r(2), p(31)],
    // Program Chair (role 3): 17,23,9,16,4
    [r(3), p(17)], [r(3), p(23)], [r(3), p(9)], [r(3), p(16)], [r(3), p(4)],
    // Dean (role 5): 17,23,9,16,4
    [r(5), p(17)], [r(5), p(23)], [r(5), p(9)], [r(5), p(16)], [r(5), p(4)],
    // Academic Director (role 6): 17,23,9,16,4
    [r(6), p(17)], [r(6), p(23)], [r(6), p(9)], [r(6), p(16)], [r(6), p(4)],
    // Faculty (role 7): 23,9,4
    [r(7), p(23)], [r(7), p(9)], [r(7), p(4)],
  ];

  for (const [roleId, permId] of rolePermPairs) {
    await addRolePermIfMissing(roleId, permId);
  }

  // -------------------------------------------------------------------------
  // 4. EXECUTIVE RANKS
  // -------------------------------------------------------------------------
  console.log('  • executive ranks');
  const execRankDefs = [
    { rank_level: 1, default_title: 'President', description: 'Highest authority with full permissions' },
    { rank_level: 2, default_title: 'Vice President Internal', description: 'Handles internal organizational matters' },
    { rank_level: 3, default_title: 'Vice President External', description: 'Handles external partnerships and representation' },
    { rank_level: 4, default_title: 'Secretary', description: 'Administrative lead' },
    { rank_level: 5, default_title: 'Treasurer', description: 'Financial manager' },
    { rank_level: 6, default_title: 'Auditor', description: 'Responsible for auditing and financial oversight' },
    { rank_level: 7, default_title: 'Public Information Officer', description: 'Handles publicity and information dissemination' },
    { rank_level: 8, default_title: 'Officer', description: 'General executive member' },
  ];

  const execRanks: Record<number, number> = {}; // rank_level → rank_id
  for (const def of execRankDefs) {
    const rank = await prisma.tbl_executive_rank.upsert({
      where: { rank_level: def.rank_level },
      update: {},
      create: def,
    });
    execRanks[def.rank_level] = rank.rank_id;
  }

  // -------------------------------------------------------------------------
  // 5. RANK PERMISSIONS  (President only — rank_level 1)
  //    SQL perm ids: 1,9,16,11,12,13,14,23,4,24,25,17,19,20,21,22,29,30,31,34,35,36,37,38,39,40,41,42,46,47,48,49,50,51
  // -------------------------------------------------------------------------
  const presidentRankPermIds = [1, 9, 16, 11, 12, 13, 14, 23, 4, 24, 25, 17, 19, 20, 21, 22, 29, 30, 31, 34, 35, 36, 37, 38, 39, 40, 41, 42, 46, 47, 48, 49, 50, 51];
  for (const permIdx of presidentRankPermIds) {
    await prisma.tbl_rank_permission.upsert({
      where: { rank_id_permission_id: { rank_id: execRanks[1], permission_id: permById[permIdx - 1] } },
      update: {},
      create: { rank_id: execRanks[1], permission_id: permById[permIdx - 1] },
    });
  }

  // -------------------------------------------------------------------------
  // 6. COLLEGES
  // -------------------------------------------------------------------------
  console.log('  • colleges');
  const collegeDefs = [
    { name: 'School of Arts, Sciences, and Education', abbreviation: 'SASE' },
    { name: 'School of Business, Management, and Accountancy', abbreviation: 'SBMA' },
    { name: 'School of Engineering, Computing and Architecture', abbreviation: 'SECA' },
  ];

  const colleges: Record<string, number> = {};
  for (const def of collegeDefs) {
    const c = await prisma.tbl_college.upsert({
      where: { abbreviation: def.abbreviation },
      update: {},
      create: { ...def, status: 'Active' },
    });
    colleges[def.abbreviation] = c.college_id;
  }

  // -------------------------------------------------------------------------
  // 7. PROGRAMS
  // -------------------------------------------------------------------------
  console.log('  • programs');
  const programDefs: Array<{ college: string; name: string; abbreviation: string }> = [
    // SASE
    { college: 'SASE', name: 'Bachelor of Science in Physical Education', abbreviation: 'BPEd' },
    { college: 'SASE', name: 'Bachelor of Arts in Communication', abbreviation: 'ABComm' },
    { college: 'SASE', name: 'Bachelor of Science in Psychology', abbreviation: 'BSPSY' },
    // SBMA
    { college: 'SBMA', name: 'Bachelor of Science in Hospitality Management', abbreviation: 'BSHM' },
    { college: 'SBMA', name: 'Bachelor of Science in Business Administration major in Human Resource Management', abbreviation: 'BSBA-HRM' },
    { college: 'SBMA', name: 'Master of Management', abbreviation: 'MM' },
    { college: 'SBMA', name: 'Bachelor of Science in Business Administration major in Financial Management', abbreviation: 'BSBA-FinMgt' },
    { college: 'SBMA', name: 'Bachelor of Science in Business Administration major in Marketing Management', abbreviation: 'BSBA-MktgMgt' },
    { college: 'SBMA', name: 'Bachelor of Science in Tourism Management', abbreviation: 'BSTM' },
    { college: 'SBMA', name: 'Bachelor of Science in Accountancy', abbreviation: 'BSAccountancy' },
    { college: 'SBMA', name: 'Bachelor of Science in Management Accounting', abbreviation: 'BSMA' },
    // SECA
    { college: 'SECA', name: 'Bachelor of Science in Computer Engineering', abbreviation: 'BSCpE' },
    { college: 'SECA', name: 'Bachelor of Science in Information Technology with a specialization in Mobile and Web Applications', abbreviation: 'BSIT-MWA' },
    { college: 'SECA', name: 'Bachelor of Science in Civil Engineering', abbreviation: 'BSCE' },
    { college: 'SECA', name: 'Bachelor of Science in Architecture', abbreviation: 'BSArch' },
    { college: 'SECA', name: 'Bachelor of Science in Computer Science with specialization in Machine Learning', abbreviation: 'BSCS-ML' },
  ];

  const programs: Record<string, number> = {};
  for (const def of programDefs) {
    const prog = await prisma.tbl_program.upsert({
      where: { abbreviation: def.abbreviation },
      update: {},
      create: {
        college_id: colleges[def.college],
        name: def.name,
        abbreviation: def.abbreviation,
        status: 'Active',
      },
    });
    programs[def.abbreviation] = prog.program_id;
  }

  // -------------------------------------------------------------------------
  // 8. SECTIONS
  // -------------------------------------------------------------------------
  console.log('  • sections');

  // Computer Science sections → BSCS-ML (program_id = 16 in insertion order)
  const csSections = ['COM251', 'COM252', 'COM253', 'COM241', 'COM242', 'COM231', 'COM232', 'COM221'];
  // IT sections → BSIT-MWA (program_id = 13 in insertion order)
  const itSections = [
    'INF251', 'INF252', 'INF253', 'INF254', 'INF255',
    'INF241', 'INF242', 'INF243', 'INF244', 'INF245', 'INF246',
    'INF231', 'INF232', 'INF233', 'INF234',
    'INF221', 'INF222', 'INF223', 'INF224',
  ];

  const sections: Record<string, number> = {};

  for (const sectionName of csSections) {
    const s = await prisma.tbl_section.upsert({
      where: { program_id_section_name: { program_id: programs['BSCS-ML'], section_name: sectionName } },
      update: {},
      create: { program_id: programs['BSCS-ML'], section_name: sectionName, is_active: true },
    });
    sections[sectionName] = s.section_id;
  }

  for (const sectionName of itSections) {
    const s = await prisma.tbl_section.upsert({
      where: { program_id_section_name: { program_id: programs['BSIT-MWA'], section_name: sectionName } },
      update: {},
      create: { program_id: programs['BSIT-MWA'], section_name: sectionName, is_active: true },
    });
    sections[sectionName] = s.section_id;
  }

  // -------------------------------------------------------------------------
  // 9. USERS
  // -------------------------------------------------------------------------
  console.log('  • users');

  const userSDAlevel2 = await prisma.tbl_user.upsert({
    where: { email: 'javierbb@students.nu-dasma.edu.ph' },
    update: {},
    create: {
      f_name: 'Benson',
      l_name: 'Javier',
      email: 'javierbb@students.nu-dasma.edu.ph',
      role_id: roleSDO.role_id,
      status: 'Active',
    },
  });

  const userSDAlevel1a = await prisma.tbl_user.upsert({
    where: { email: 'sdao.staff1@nu.edu.ph' },
    update: {},
    create: {
      f_name: 'Jose',
      l_name: 'Reyes',
      email: 'sdao.staff1@nu.edu.ph',
      role_id: roleSDO.role_id,
      status: 'Active',
    },
  });

  const userSDAlevel1b = await prisma.tbl_user.upsert({
    where: { email: 'sdao.staff2@nu.edu.ph' },
    update: {},
    create: {
      f_name: 'Anna',
      l_name: 'Cruz',
      email: 'sdao.staff2@nu.edu.ph',
      role_id: roleSDO.role_id,
      status: 'Active',
    },
  });

  // Advisers (Faculty role)
  const userAdviser1 = await prisma.tbl_user.upsert({
    where: { email: 'madruniosm@students.nu-dasma.edu.ph' },
    update: {},
    create: {
      f_name: 'Samantha Joy',
      l_name: 'Madrunio',
      email: 'madruniosm@students.nu-dasma.edu.ph',
      program_id: programs['BPEd'],
      role_id: roleAdviser.role_id,
      status: 'Active',
    },
  });

  const userAdviser2 = await prisma.tbl_user.upsert({
    where: { email: 'adviser.robotics@nu.edu.ph' },
    update: {},
    create: {
      f_name: 'Elena',
      l_name: 'Tan',
      email: 'adviser.robotics@nu.edu.ph',
      program_id: programs['BSCpE'],
      role_id: roleAdviser.role_id,
      status: 'Active',
    },
  });

  const userAdviser3 = await prisma.tbl_user.upsert({
    where: { email: 'adviser.sce@nu.edu.ph' },
    update: {},
    create: {
      f_name: 'Roberto',
      l_name: 'Garcia',
      email: 'adviser.sce@nu.edu.ph',
      program_id: programs['BSCE'],
      role_id: roleAdviser.role_id,
      status: 'Active',
    },
  });

  // Program Chair, Dean, Academic Director
  const userProgChair = await prisma.tbl_user.upsert({
    where: { email: 'dumalagim@students.nu-dasma.edu.ph' },
    update: {},
    create: {
      f_name: 'Iver',
      l_name: 'Dumalag',
      email: 'dumalagim@students.nu-dasma.edu.ph',
      program_id: programs['BPEd'],
      role_id: roleProgChair.role_id,
      status: 'Active',
    },
  });

  const userDean = await prisma.tbl_user.upsert({
    where: { email: 'realoam@students.nu-dasma.edu.ph' },
    update: {},
    create: {
      f_name: 'Alister',
      l_name: 'Realo',
      email: 'realoam@students.nu-dasma.edu.ph',
      role_id: roleDean.role_id,
      status: 'Active',
    },
  });

  const userAcadDir = await prisma.tbl_user.upsert({
    where: { email: 'miraballesl@students.nu-dasma.edu.ph' },
    update: {},
    create: {
      f_name: 'Loraine',
      l_name: 'Miraballes',
      email: 'miraballesl@students.nu-dasma.edu.ph',
      role_id: roleAcadDir.role_id,
      status: 'Active',
    },
  });

  // Students
  const studentDefs = [
    { user_id: 'student-001', f_name: 'Juan', l_name: 'Dela Cruz', email: '2021-00001@students.nu.edu.ph', program: 'BSIT-MWA', section: 'INF251' },
    { user_id: 'student-002', f_name: 'Maria', l_name: 'Reyes', email: '2021-00002@students.nu.edu.ph', program: 'BSIT-MWA', section: 'INF251' },
    { user_id: 'student-003', f_name: 'Carlo', l_name: 'Santos', email: '2021-00003@students.nu.edu.ph', program: 'BSIT-MWA', section: 'INF231' },
    { user_id: 'student-004', f_name: 'Ana', l_name: 'Villanueva', email: '2021-00004@students.nu.edu.ph', program: 'BSIT-MWA', section: 'INF231' },
    { user_id: 'student-005', f_name: 'Miguel', l_name: 'Lopez', email: '2021-00005@students.nu.edu.ph', program: 'BSCS-ML', section: 'COM241' },
    { user_id: 'student-006', f_name: 'Sofia', l_name: 'Martinez', email: '2021-00006@students.nu.edu.ph', program: 'BSCS-ML', section: 'COM231' },
    { user_id: 'student-007', f_name: 'Luis', l_name: 'Gonzales', email: '2022-00001@students.nu.edu.ph', program: 'BSCpE', section: null },
    { user_id: 'student-008', f_name: 'Isabella', l_name: 'Ramos', email: '2022-00002@students.nu.edu.ph', program: 'BSCpE', section: null },
    { user_id: 'student-009', f_name: 'Diego', l_name: 'Torres', email: '2022-00003@students.nu.edu.ph', program: 'BSCE', section: null },
    { user_id: 'student-010', f_name: 'Camila', l_name: 'Flores', email: '2022-00004@students.nu.edu.ph', program: 'BSCE', section: null },
    { user_id: 'student-011', f_name: 'Andre', l_name: 'Castro', email: '2022-00005@students.nu.edu.ph', program: 'BSBA-HRM', section: null },
    { user_id: 'student-012', f_name: 'Bianca', l_name: 'Morales', email: '2022-00006@students.nu.edu.ph', program: 'BSBA-HRM', section: null },
  ];

  const students: Record<string, string> = {};
  for (const def of studentDefs) {
    const u = await prisma.tbl_user.upsert({
      where: { email: def.email },
      update: {},
      create: {
        f_name: def.f_name,
        l_name: def.l_name,
        email: def.email,
        program_id: programs[def.program],
        section_id: def.section ? sections[def.section] : undefined,
        role_id: roleStudent.role_id,
        status: 'Active',
      },
    });
    students[def.user_id] = u.user_id;
  }

  // -------------------------------------------------------------------------
  // 9b. BULK STUDENT POOL  (1 300 students shared across the 5 orgs)
  // -------------------------------------------------------------------------
  console.log('  • bulk student pool');

  const POOL_SIZE = 1300;
  const MEMBERS_PER_ORG = 1000;

  faker.seed(7777); // deterministic — override before bulk generation
  {
    const allProgIds = Object.values(programs);
    const bulkData: Array<{
      f_name: string; l_name: string; email: string;
      program_id: number; role_id: number; status: 'Active';
    }> = [];
    const bulkEmails: string[] = [];

    for (let i = 0; i < POOL_SIZE; i++) {
      const email = `s${String(i + 1).padStart(5, '0')}@students.nu.edu.ph`;
      bulkEmails.push(email);
      bulkData.push({
        f_name: faker.person.firstName(),
        l_name: faker.person.lastName(),
        email,
        program_id: allProgIds[i % allProgIds.length],
        role_id: roleStudent.role_id,
        status: 'Active',
      });
    }

    await prisma.tbl_user.createMany({ data: bulkData, skipDuplicates: true });
  }

  // Fetch pool in deterministic order (email sort: s00001 … s01300)
  const _bulkEmails: string[] = Array.from({ length: POOL_SIZE }, (_, i) =>
    `s${String(i + 1).padStart(5, '0')}@students.nu.edu.ph`
  );
  const _poolRows = await prisma.tbl_user.findMany({
    where: { email: { in: _bulkEmails } },
    select: { user_id: true, email: true },
    orderBy: { email: 'asc' },
  });
  const poolIds = _poolRows.map(u => u.user_id);
  console.log(`    bulk pool: ${poolIds.length} users`);

  // -------------------------------------------------------------------------
  // 10. SDAO APPROVERS
  // -------------------------------------------------------------------------
  console.log('  • sdao approvers');
  await prisma.tbl_sdao_approver.deleteMany();

  await prisma.tbl_sdao_approver.upsert({
    where: { user_id: userSDAlevel1a.user_id },
    update: {},
    create: { user_id: userSDAlevel1a.user_id, sdao_rank: 1 },
  });
  await prisma.tbl_sdao_approver.upsert({
    where: { user_id: userSDAlevel1b.user_id },
    update: {},
    create: { user_id: userSDAlevel1b.user_id, sdao_rank: 2 },
  });
  await prisma.tbl_sdao_approver.upsert({
    where: { user_id: userSDAlevel2.user_id },
    update: {},
    create: { user_id: userSDAlevel2.user_id, sdao_rank: 3 },
  });

  // -------------------------------------------------------------------------
  // 11. ACADEMIC TERMS
  // -------------------------------------------------------------------------
  console.log('  • academic terms');
  const term1 = await prisma.tbl_academic_term.upsert({
    where: { term_name: 'AY 2025-2026 1st Term' },
    update: {},
    create: {
      term_name: 'AY 2025-2026 1st Term',
      term_description: 'First term of Academic Year 2025-2026',
      academic_year: '2025-2026',
      start_date: new Date('2025-07-14'),
      end_date: new Date('2025-11-07'),
      created_by: userSDAlevel2.user_id,
    },
  });

  const term2 = await prisma.tbl_academic_term.upsert({
    where: { term_name: 'AY 2025-2026 2nd Term' },
    update: {},
    create: {
      term_name: 'AY 2025-2026 2nd Term',
      term_description: 'Second term of Academic Year 2025-2026',
      academic_year: '2025-2026',
      start_date: new Date('2025-11-24'),
      end_date: new Date('2026-03-20'),
      created_by: userSDAlevel2.user_id,
    },
  });

  void term2; // suppress unused warning

  const term3 = await prisma.tbl_academic_term.upsert({
    where: { term_name: 'AY 2025-2026 Summer' },
    update: {},
    create: {
      term_name: 'AY 2025-2026 Summer',
      term_description: 'Summer term of Academic Year 2025-2026',
      academic_year: '2025-2026',
      start_date: new Date('2026-04-06'),
      end_date: new Date('2026-05-29'),
      created_by: userSDAlevel2.user_id,
    },
  });

  void term3;

  // -------------------------------------------------------------------------
  // 12. SUBMISSION PERIOD
  // -------------------------------------------------------------------------
  console.log('  • submission period');
  const existingPeriod = await prisma.tbl_application_period.findFirst({ where: { is_active: true } });
  const activePeriod = existingPeriod ?? await prisma.tbl_application_period.create({
    data: {
      start_date: new Date('2025-06-01'),
      end_date: new Date('2025-06-30'),
      start_time: new Date('1970-01-01T08:00:00'),
      end_time: new Date('1970-01-01T17:00:00'),
      is_active: true,
      created_by: userSDAlevel2.user_id,
    },
  });

  void activePeriod;

  // -------------------------------------------------------------------------
  // 13. EVALUATION QUESTION GROUPS + QUESTIONS
  // -------------------------------------------------------------------------
  console.log('  • evaluation questions');
  const existingEvalGroups = await prisma.tbl_evaluation_question_group.count();

  if (existingEvalGroups === 0) {
    const evalGroups = [
      {
        group_title: 'Activity: Meeting/Seminar/Conference/Workshop/Quiz Bee/Competition/Sport fest, etc.',
        group_description: 'Question about activities',
        questions: [
          { text: 'Is the activity relevant/important to you?', type: 'likert_4' as const },
          { text: 'Is the program relevant to the course/you\'re in?', type: 'likert_4' as const },
          { text: 'Were the objectives clear and communicated before the activity?', type: 'likert_4' as const },
          { text: 'Were the objectives met by the activity?', type: 'likert_4' as const },
          { text: 'Was the venue proper for this kind of activity?', type: 'likert_4' as const },
          { text: 'Did the activity start and end on time?', type: 'likert_4' as const },
          { text: 'Did the organizers maintain an orderly environment all throughout the activity?', type: 'likert_4' as const },
          { text: 'Was the event/activity well-advertised/properly announce?', type: 'likert_4' as const },
          { text: 'Would you recommend this activity to your classmates/friends?', type: 'likert_4' as const },
          { text: 'Do you want an activity like this to happen more often?', type: 'likert_4' as const },
          { text: 'Overall evaluation', type: 'likert_4' as const },
        ],
      },
      {
        group_title: 'About the Speaker/Resource person',
        group_description: 'Feedback about event speakers/presenters',
        questions: [
          { text: 'Was the speaker well-prepared and knowledgeable on the topic?', type: 'likert_4' as const },
          { text: 'Did the speaker use different and appropriate methods in delivering the topic?', type: 'likert_4' as const },
          { text: 'Was the speaker able to connect with the audience and catch their attention?', type: 'likert_4' as const },
        ],
      },
      {
        group_title: 'Meals',
        group_description: 'Feedback about meals',
        questions: [
          { text: 'Were the meals/snacks provided enough to fill you?', type: 'likert_4' as const },
          { text: 'Did the meals/snacks have a pleasant taste?', type: 'likert_4' as const },
        ],
      },
      {
        group_title: 'Handouts',
        group_description: 'Feedback about handouts',
        questions: [
          { text: 'Are the handouts provided useful?', type: 'likert_4' as const },
          { text: 'Is the printing of the handouts clear?', type: 'likert_4' as const },
        ],
      },
      {
        group_title: 'Transportation',
        group_description: 'Feedback about transportation',
        questions: [
          { text: 'Did you feel safe during the travel to the venue?', type: 'likert_4' as const },
          { text: 'Did you feel that the transportation provided is in good running condition?', type: 'likert_4' as const },
          { text: 'Did you feel safe with the driver\'s skills?', type: 'likert_4' as const },
        ],
      },
      {
        group_title: 'Comments and Suggestions',
        group_description: 'Feedback about the whole event',
        questions: [
          { text: 'What important knowledge or information did you gain from this activity?', type: 'textbox' as const },
          { text: 'What did you like most about the activity?', type: 'textbox' as const },
          { text: 'What did you like least about the activity?', type: 'textbox' as const },
          { text: 'Any other comments/suggestions for further improvement the activity?', type: 'textbox' as const },
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
  // 14. APPLICATION REQUIREMENTS (organization)
  // -------------------------------------------------------------------------
  console.log('  • application requirements');
  const existingOrgReqs = await prisma.tbl_application_requirement.count();
  const orgReqDefs = existingOrgReqs > 0 ? [] : [
    { requirement_name: 'Letter of Intent', is_applicable_to: 'new' as const },
    { requirement_name: 'By Laws of the Organization', is_applicable_to: 'both' as const },
    { requirement_name: 'List of Officers/Founders', is_applicable_to: 'both' as const },
    { requirement_name: 'Letter from the College Dean/Department Chair endorsing the Faculty Adviser', is_applicable_to: 'both' as const },
    { requirement_name: 'List of Members', is_applicable_to: 'both' as const },
    { requirement_name: 'Latest Certificate of Grades of Officers', is_applicable_to: 'both' as const },
    { requirement_name: 'Biodata/CV of Officers', is_applicable_to: 'both' as const },
    { requirement_name: 'Resume/CV of Adviser', is_applicable_to: 'new' as const },
    { requirement_name: 'List of Proposed Projects with Proposed Budget for the AY', is_applicable_to: 'both' as const },
    { requirement_name: 'List of Past Projects', is_applicable_to: 'renew' as const },
    { requirement_name: 'Financial Statement of the Previous AY (Signed by Officers and Adviser)', is_applicable_to: 'renew' as const },
    { requirement_name: 'Summary of Evaluation of the Past Projects', is_applicable_to: 'renew' as const },
  ];

  for (const def of orgReqDefs) {
    await prisma.tbl_application_requirement.create({
      data: { ...def, created_by: userSDAlevel2.user_id },
    });
  }

  // -------------------------------------------------------------------------
  // 15. EVENT APPLICATION REQUIREMENTS
  // -------------------------------------------------------------------------
  console.log('  • event application requirements');
  const existingEventReqs = await prisma.tbl_event_application_requirement.count();
  const eventReqDefs = existingEventReqs > 0 ? [] : [
    { requirement_name: 'Event Proposal/Concept Paper', is_applicable_to: 'pre_event' as const },
    { requirement_name: 'Event Budget Proposal', is_applicable_to: 'pre_event' as const },
    { requirement_name: 'Permission Letter / MOU', is_applicable_to: 'pre_event' as const },
    { requirement_name: 'Event Post-Activity Report', is_applicable_to: 'post_event' as const },
    { requirement_name: 'Financial Liquidation Report', is_applicable_to: 'post_event' as const },
    { requirement_name: 'Certificate of Attendance', is_applicable_to: 'post_event' as const },
    { requirement_name: 'Attendance Sheet', is_applicable_to: 'post_event' as const },
    { requirement_name: 'Documentation Photos (compiled)', is_applicable_to: 'post_event' as const },
  ];

  for (const def of eventReqDefs) {
    await prisma.tbl_event_application_requirement.create({
      data: { ...def, created_by: userSDAlevel2.user_id, status: 'active' },
    });
  }

  // -------------------------------------------------------------------------
  // 16. FINANCIAL CATEGORIES
  // -------------------------------------------------------------------------
  console.log('  • financial categories');

  const catIncome = await prisma.tbl_financial_category.upsert({
    where: { code: 'INCOME' },
    update: {},
    create: { code: 'INCOME', label: 'Income', kind: 'INCOME', active: true },
  });
  const catExpense = await prisma.tbl_financial_category.upsert({
    where: { code: 'EXPENSE' },
    update: {},
    create: { code: 'EXPENSE', label: 'Expense', kind: 'EXPENSE', active: true },
  });

  const financialSubCats = [
    { code: 'MEMBERSHIP_FEE', label: 'Membership Fee', kind: 'INCOME' as const, parent: catIncome.category_id },
    { code: 'EVENT_FEE', label: 'Event Registration Fee', kind: 'INCOME' as const, parent: catIncome.category_id },
    { code: 'DONATION', label: 'Donations / Sponsorship', kind: 'INCOME' as const, parent: catIncome.category_id },
    { code: 'FUND_RAISE', label: 'Fundraising', kind: 'INCOME' as const, parent: catIncome.category_id },
    { code: 'EVENT_EXP', label: 'Event Expenses', kind: 'EXPENSE' as const, parent: catExpense.category_id },
    { code: 'SUPPLIES', label: 'Office Supplies', kind: 'EXPENSE' as const, parent: catExpense.category_id },
    { code: 'FOOD', label: 'Food and Beverages', kind: 'EXPENSE' as const, parent: catExpense.category_id },
    { code: 'TRANSPORT', label: 'Transportation', kind: 'EXPENSE' as const, parent: catExpense.category_id },
    { code: 'PRINTING', label: 'Printing and Publishing', kind: 'EXPENSE' as const, parent: catExpense.category_id },
    { code: 'MISC', label: 'Miscellaneous', kind: 'EXPENSE' as const, parent: catExpense.category_id },
  ];

  const finCats: Record<string, number> = {
    INCOME: catIncome.category_id,
    EXPENSE: catExpense.category_id,
  };

  for (const def of financialSubCats) {
    const c = await prisma.tbl_financial_category.upsert({
      where: { code: def.code },
      update: {},
      create: { code: def.code, label: def.label, kind: def.kind, parent_category_id: def.parent, active: true },
    });
    finCats[def.code] = c.category_id;
  }

  // -------------------------------------------------------------------------
  // 17. TRANSACTION TYPES
  // -------------------------------------------------------------------------
  console.log('  • transaction types');
  const txnTypeDefs = [
    { code: 'INCOME', label: 'Income' },
    { code: 'EXPENSE', label: 'Expense' },
  ];

  const txnTypes: Record<string, number> = {};
  for (const def of txnTypeDefs) {
    const t = await prisma.tbl_transaction_type.upsert({
      where: { code: def.code },
      update: {},
      create: def,
    });
    txnTypes[def.code] = t.transaction_type_id;
  }

  // -------------------------------------------------------------------------
  // 18. PAYMENT TYPES
  // -------------------------------------------------------------------------
  console.log('  • payment types');
  const payTypeDefs = [
    { code: 'CASH', label: 'Cash', method_group: 'OTC' },
    { code: 'GCASH', label: 'GCash', method_group: 'EWALLET' },
    { code: 'MAYA', label: 'Maya (PayMaya)', method_group: 'EWALLET' },
    { code: 'BANK', label: 'Bank Transfer', method_group: 'BANK' },
    { code: 'ONLINE', label: 'Online Payment', method_group: 'ONLINE' },
  ];

  const payTypes: Record<string, number> = {};
  for (const def of payTypeDefs) {
    const pt = await prisma.tbl_payment_type.upsert({
      where: { code: def.code },
      update: {},
      create: def,
    });
    payTypes[def.code] = pt.payment_type_id;
  }

  // -------------------------------------------------------------------------
  // 19. TRANSACTION TYPE ↔ CATEGORY
  // -------------------------------------------------------------------------
  console.log('  • transaction type ↔ category');
  const txnTypeCatMap: Array<[string, string]> = [
    ['INCOME', 'MEMBERSHIP_FEE'],
    ['INCOME', 'EVENT_FEE'],
    ['INCOME', 'DONATION'],
    ['INCOME', 'FUND_RAISE'],
    ['EXPENSE', 'EVENT_EXP'],
    ['EXPENSE', 'SUPPLIES'],
    ['EXPENSE', 'FOOD'],
    ['EXPENSE', 'TRANSPORT'],
    ['EXPENSE', 'PRINTING'],
    ['EXPENSE', 'MISC'],
  ];

  for (const [typeCode, catCode] of txnTypeCatMap) {
    await prisma.tbl_transaction_type_category.upsert({
      where: {
        transaction_type_id_category_id: {
          transaction_type_id: txnTypes[typeCode],
          category_id: finCats[catCode],
        },
      },
      update: {},
      create: {
        transaction_type_id: txnTypes[typeCode],
        category_id: finCats[catCode],
      },
    });
  }

  // -------------------------------------------------------------------------
  // 20. RECEIPT SEQUENCES
  // -------------------------------------------------------------------------
  console.log('  • receipt sequences');
  await prisma.tbl_receipt_sequence.upsert({
    where: { series_key: 'MEMBERSHIP' },
    update: {},
    create: { series_key: 'MEMBERSHIP', prefix: 'MEM', pad_length: 6, current_value: 0 },
  });
  await prisma.tbl_receipt_sequence.upsert({
    where: { series_key: 'EVENT' },
    update: {},
    create: { series_key: 'EVENT', prefix: 'EVT', pad_length: 6, current_value: 0 },
  });
  await prisma.tbl_receipt_sequence.upsert({
    where: { series_key: 'GENERAL' },
    update: {},
    create: { series_key: 'GENERAL', prefix: 'RCT', pad_length: 6, current_value: 0 },
  });

  // -------------------------------------------------------------------------
  // 21. VENUES  (essential system venues — no created_by)
  // -------------------------------------------------------------------------
  console.log('  • venues');

  const essentialVenues = [
    'Classroom',
    'AVR',
    'Gymnasium',
    '1st Floor Student Lounge',
    '2nd Floor Student Lounge',
    '3rd Floor Student Lounge',
    'Function Room',
    'Restaurant',
    'Canteen',
    'Prayer Room',
    'Chapel',
  ];

  for (const venueName of essentialVenues) {
    await prisma.tbl_venue.upsert({
      where: { name: venueName },
      update: {},
      create: { name: venueName, created_by: null },
    });
  }

  // -------------------------------------------------------------------------
  // 22. ORGANIZATIONS  (5 orgs × 1 000 members + 5 committees each)
  // -------------------------------------------------------------------------
  console.log('  • organizations');

  type OrgDef = {
    name: string;
    adviser: string;      // user_id
    presidentId: string;  // user_id
    category: 'Co_Curricular_Organization' | 'Extra_Curricular_Organization';
    base_program: string;
    membership_fee_type: 'Per_Term' | 'Whole_Academic_Year' | 'Free';
    membership_fee_amount: number;
    programs: string[];
    description: string;
  };

  const orgDefs: OrgDef[] = [
    {
      name: 'Junior Philippine Computer Society',
      adviser: userAdviser1.user_id,
      presidentId: students['student-001'],
      category: 'Co_Curricular_Organization',
      base_program: 'BSIT-MWA',
      membership_fee_type: 'Per_Term',
      membership_fee_amount: 150,
      programs: ['BSIT-MWA', 'BSCS-ML'],
      description: 'The JPCS is the official organization for IT and CS students, promoting excellence in computing.',
    },
    {
      name: 'Robotics and Automation Society',
      adviser: userAdviser2.user_id,
      presidentId: students['student-007'],
      category: 'Co_Curricular_Organization',
      base_program: 'BSCpE',
      membership_fee_type: 'Whole_Academic_Year',
      membership_fee_amount: 500,
      programs: ['BSCpE', 'BSCS-ML'],
      description: 'Promoting innovation in robotics, automation, and embedded systems.',
    },
    {
      name: 'Society of Civil Engineers',
      adviser: userAdviser3.user_id,
      presidentId: students['student-009'],
      category: 'Co_Curricular_Organization',
      base_program: 'BSCE',
      membership_fee_type: 'Per_Term',
      membership_fee_amount: 200,
      programs: ['BSCE'],
      description: 'Fostering professional development among civil engineering students.',
    },
    {
      name: 'Junior Marketing Association',
      adviser: userAdviser1.user_id,
      presidentId: students['student-011'],
      category: 'Co_Curricular_Organization',
      base_program: 'BSBA-HRM',
      membership_fee_type: 'Whole_Academic_Year',
      membership_fee_amount: 300,
      programs: ['BSBA-HRM', 'BSAccountancy'],
      description: 'Developing marketing professionals through workshops, competitions, and networking.',
    },
    {
      name: 'Stage Arts and Development Organization',
      adviser: userAdviser2.user_id,
      presidentId: students['student-006'],
      category: 'Extra_Curricular_Organization',
      base_program: 'BSIT-MWA',
      membership_fee_type: 'Free',
      membership_fee_amount: 0,
      programs: ['BSIT-MWA', 'BSCS-ML', 'BSCE', 'BSBA-HRM'],
      description: 'A performing arts organization open to all students who love theater and the arts.',
    },
  ];

  // Committee definitions — same 5 committees seeded for every org
  const COMMITTEE_DEFS = [
    { name: 'Events Committee', description: 'Plans and executes all organizational events' },
    { name: 'Membership Committee', description: 'Manages recruitment, records, and member engagement' },
    { name: 'Finance Committee', description: 'Oversees financial records, budgets, and transactions' },
    { name: 'Marketing & Communications', description: 'Handles publicity, social media, and communications' },
    { name: 'Academic Affairs Committee', description: 'Organizes seminars, workshops, and academic programs' },
  ] as const;

  // Breakdown of the 1 000 slots per org
  const EXEC_POOL_SLOTS = 10;  // 10 bulk-pool exec positions (ranks 2-8)
  const REGULAR_COUNT = MEMBERS_PER_ORG - 1 - EXEC_POOL_SLOTS; // 989 regular members
  const CMT_MEMBER_CNT = 40;  // members per committee (drawn from regular slice)

  // Rank assignment for the 10 pool exec slots
  //  slot 0 → VP Int, 1 → VP Ext, 2 → Secretary, 3 → Treasurer,
  //  4 → Auditor, 5 → PIO, 6-9 → Officer
  const EXEC_RANK_SLOTS = [2, 3, 4, 5, 6, 7, 8, 8, 8, 8];

  const cycleNumber = 1;

  for (let orgIdx = 0; orgIdx < orgDefs.length; orgIdx++) {
    const def = orgDefs[orgIdx];
    const slug = slugify(def.name);

    const existing = await prisma.tbl_organization.findFirst({ where: { name: def.name } });
    if (existing) {
      console.log(`     skip (exists): ${def.name}`);
      continue;
    }

    // a) Create version (organization_id = null first)
    const version = await prisma.tbl_organization_version.create({
      data: {
        organization_id: null,
        name: def.name,
        status: 'Approved',
        description: def.description,
        base_program_id: programs[def.base_program] ?? null,
        membership_fee_type: def.membership_fee_type,
        membership_fee_amount: def.membership_fee_amount,
        category: def.category,
        is_recruiting: true,
        is_open_to_all_courses: def.category === 'Extra_Curricular_Organization',
        created_by: userSDAlevel2.user_id,
        valid_from: new Date('2025-06-01'),
        valid_to: null,
      },
    });

    // b) Create organization
    const org = await prisma.tbl_organization.create({
      data: {
        adviser_id: def.adviser,
        current_org_version_id: version.org_version_id,
        name: def.name,
        slug,
        status: 'Approved',
        term_option: def.membership_fee_type !== 'Free',
        term_exclusion_policy: 'CURRENT_TERM',
      },
    });

    // c) Patch version with real organization_id
    await prisma.tbl_organization_version.update({
      where: { org_version_id: version.org_version_id },
      data: { organization_id: org.organization_id },
    });

    // d) Version course assignments
    for (const prog of def.programs) {
      if (!programs[prog]) continue;
      await prisma.tbl_organization_version_course.upsert({
        where: { org_version_id_program_id: { org_version_id: version.org_version_id, program_id: programs[prog] } },
        update: {},
        create: { org_version_id: version.org_version_id, program_id: programs[prog] },
      });
    }

    // e) Organization course (legacy)
    for (const prog of def.programs) {
      if (!programs[prog]) continue;
      await prisma.tbl_organization_course.upsert({
        where: { organization_id_program_id: { organization_id: org.organization_id, program_id: programs[prog] } },
        update: {},
        create: { organization_id: org.organization_id, program_id: programs[prog] },
      });
    }

    // f) Renewal cycle
    await prisma.tbl_renewal_cycle.upsert({
      where: { organization_id_cycle_number: { organization_id: org.organization_id, cycle_number: cycleNumber } },
      update: {},
      create: {
        organization_id: org.organization_id,
        cycle_number: cycleNumber,
        org_version_id: version.org_version_id,
        president_id: def.presidentId,
        start_date: new Date('2025-06-01'),
      },
    });

    // g) Executive roles (8 title/rank types)
    const execRoleTitles = [
      { rank: 1, title: 'President' },
      { rank: 2, title: 'Vice President Internal' },
      { rank: 3, title: 'Vice President External' },
      { rank: 4, title: 'Secretary' },
      { rank: 5, title: 'Treasurer' },
      { rank: 6, title: 'Auditor' },
      { rank: 7, title: 'Public Information Officer' },
      { rank: 8, title: 'Officer' },
    ];
    const createdExecRoleIds: Record<number, number> = {};
    for (const er of execRoleTitles) {
      const created = await prisma.tbl_executive_role.create({
        data: {
          organization_id: org.organization_id,
          cycle_number: cycleNumber,
          role_title: er.title,
          rank_id: execRanks[er.rank],
        },
      });
      createdExecRoleIds[er.rank] = created.executive_role_id;
    }

    // h) Slice the bulk pool for this org (cyclic offset → ~260-member overlap between adjacent orgs)
    const orgOffset = (orgIdx * Math.floor(poolIds.length / orgDefs.length)) % poolIds.length;
    const totalNeeded = EXEC_POOL_SLOTS + REGULAR_COUNT;
    const orgPoolSlice: string[] =
      orgOffset + totalNeeded <= poolIds.length
        ? poolIds.slice(orgOffset, orgOffset + totalNeeded)
        : [...poolIds.slice(orgOffset), ...poolIds.slice(0, totalNeeded - (poolIds.length - orgOffset))];

    const execPoolSlice = orgPoolSlice.slice(0, EXEC_POOL_SLOTS);
    const regularPoolSlice = orgPoolSlice.slice(EXEC_POOL_SLOTS);

    // i) President (named student) — rank 1
    await prisma.tbl_organization_members.create({
      data: {
        organization_id: org.organization_id,
        cycle_number: cycleNumber,
        user_id: def.presidentId,
        org_version_id: version.org_version_id,
        member_type: 'Executive',
        status: 'Active',
        executive_role_id: createdExecRoleIds[1],
        payment_start_term_id: term1.term_id,
      },
    });

    // j) Other exec members from bulk pool (ranks 2-8)
    for (let ei = 0; ei < EXEC_POOL_SLOTS; ei++) {
      const rank = EXEC_RANK_SLOTS[ei];
      await prisma.tbl_organization_members.create({
        data: {
          organization_id: org.organization_id,
          cycle_number: cycleNumber,
          user_id: execPoolSlice[ei],
          org_version_id: version.org_version_id,
          member_type: 'Executive',
          status: 'Active',
          executive_role_id: createdExecRoleIds[rank],
          payment_start_term_id: term1.term_id,
        },
      });
    }

    // k) Regular members — bulk insert (989 members)
    await prisma.tbl_organization_members.createMany({
      data: regularPoolSlice.map(uid => ({
        organization_id: org.organization_id,
        cycle_number: cycleNumber,
        user_id: uid,
        org_version_id: version.org_version_id,
        member_type: 'Member' as const,
        status: 'Active' as const,
        payment_start_term_id: term1.term_id,
      })),
      skipDuplicates: true,
    });

    // l) Committees — 5 per org, each with 40 members from the regular slice
    for (let ci = 0; ci < COMMITTEE_DEFS.length; ci++) {
      const cmtDef = COMMITTEE_DEFS[ci];

      const committee = await prisma.tbl_committee.create({
        data: {
          organization_id: org.organization_id,
          cycle_number: cycleNumber,
          name: cmtDef.name,
          description: cmtDef.description,
        },
      });

      const cmtHead = await prisma.tbl_committee_role.create({
        data: { committee_id: committee.committee_id, role_name: 'Committee_Head' },
      });
      const cmtOfficer = await prisma.tbl_committee_role.create({
        data: { committee_id: committee.committee_id, role_name: 'Committee_Officer' },
      });

      // Head gets CREATE_EVENT + SUBMIT_REQUIREMENTS
      for (const permName of ['CREATE_EVENT', 'SUBMIT_REQUIREMENTS']) {
        if (!permissions[permName]) continue;
        await prisma.tbl_committee_role_permission.create({
          data: { committee_role_id: cmtHead.committee_role_id, permission_id: permissions[permName] },
        });
      }

      // Assign 40 members from the regular slice (first of each group = head)
      const cmtSlice = regularPoolSlice.slice(ci * CMT_MEMBER_CNT, (ci + 1) * CMT_MEMBER_CNT);
      if (cmtSlice.length > 0) {
        await prisma.tbl_committee_members.createMany({
          data: cmtSlice.map((uid, mi) => ({
            committee_id: committee.committee_id,
            user_id: uid,
            committee_role_id: mi === 0 ? cmtHead.committee_role_id : cmtOfficer.committee_role_id,
          })),
          skipDuplicates: true,
        });
      }
    }

    // m) Membership payments — president + exec pool members only (perf: skip 989 regular)
    if (def.membership_fee_type !== 'Free') {
      const paidIds = [def.presidentId, ...execPoolSlice];
      for (const uid of paidIds) {
        const txn = await prisma.tbl_transaction.create({
          data: {
            user_id: uid,
            payer_name: `Member ${uid.slice(-6)}`,
            payment_description: `${def.name} — Membership Fee ${term1.term_name}`,
            amount: def.membership_fee_amount,
            transaction_type_id: txnTypes['INCOME'],
            payment_type_id: payTypes['CASH'],
            category_id: finCats['MEMBERSHIP_FEE'],
            org_version_id: version.org_version_id,
            status: 'Completed',
            transaction_date: new Date('2025-06-15T10:00:00'),
          },
        });
        await prisma.tbl_term_payments.create({
          data: {
            user_id: uid,
            organization_id: org.organization_id,
            organization_version_id: version.org_version_id,
            term_id: term1.term_id,
            transaction_id: txn.transaction_id,
            payment_status: 'Paid',
            verified_by: userSDAlevel1a.user_id,
            verified_at: new Date('2025-06-16T09:00:00'),
          },
        });
      }
    }

    console.log(`     ✓ ${def.name} — ${MEMBERS_PER_ORG} members, ${COMMITTEE_DEFS.length} committees (org_id=${org.organization_id})`);
  }

  // -------------------------------------------------------------------------
  // 23. EVENTS
  // -------------------------------------------------------------------------
  console.log('  • events');

  const existingEvents = await prisma.tbl_event.count();

  if (existingEvents === 0) {
    faker.seed(42); // deterministic output

    // Collect all created orgs with their president from renewal cycle
    const createdOrgs = await prisma.tbl_renewal_cycle.findMany({
      where: { cycle_number: 1 },
      select: {
        organization_id: true,
        president_id: true,
      },
    });

    const eventTemplates: Array<{
      title: string;
      description: string;
      venue: string;
      venueType: 'Face_to_face' | 'Online';
      isOpenTo: 'Members_only' | 'Open_to_all' | 'NU_Students_only';
      feeType: 'Free' | 'Paid';
      fee: number | null;
      capacity: number;
      daysFromNow: number; // positive = future, negative = past
      durationDays: number;
      status: 'Approved' | 'Pending' | 'Archived';
      startTime: string; // HH:MM:SS — used for schedule slots
      endTime: string;   // HH:MM:SS — used for schedule slots
    }> = [
        {
          title: 'General Assembly',
          description: 'Mandatory general assembly for all members. Updates on organizational activities, plans for the semester, and officer reports.',
          venue: 'University Auditorium',
          venueType: 'Face_to_face',
          isOpenTo: 'Members_only',
          feeType: 'Free',
          fee: null,
          capacity: 100,
          daysFromNow: -30,
          durationDays: 1,
          status: 'Approved',
          startTime: '09:00:00',
          endTime: '12:00:00',
        },
        {
          title: 'Leadership Summit',
          description: 'A full-day summit designed to develop leadership skills, strategic thinking, and teamwork among student leaders.',
          venue: 'Conference Room A, Main Building',
          venueType: 'Face_to_face',
          isOpenTo: 'Members_only',
          feeType: 'Paid',
          fee: 200,
          capacity: 60,
          daysFromNow: 14,
          durationDays: 1,
          status: 'Approved',
          startTime: '08:00:00',
          endTime: '17:00:00',
        },
        {
          title: 'Technical Workshop',
          description: 'Hands-on workshop covering practical skills relevant to our field. Industry professionals will lead the sessions.',
          venue: 'Computer Laboratory 3, Tech Building',
          venueType: 'Face_to_face',
          isOpenTo: 'NU_Students_only',
          feeType: 'Paid',
          fee: 150,
          capacity: 40,
          daysFromNow: 30,
          durationDays: 2,
          status: 'Pending',
          startTime: '13:00:00',
          endTime: '18:00:00',
        },
        {
          title: 'Year-End Celebration',
          description: 'Celebrate the achievements of our members and the success of this academic year. Food, games, and awards night.',
          venue: 'University Gymnasium',
          venueType: 'Face_to_face',
          isOpenTo: 'Open_to_all',
          feeType: 'Paid',
          fee: 350,
          capacity: 200,
          daysFromNow: 60,
          durationDays: 1,
          status: 'Pending',
          startTime: '18:00:00',
          endTime: '22:00:00',
        },
        {
          title: 'Online Seminar',
          description: 'A virtual seminar featuring guest speakers from industry. Participants will gain insights on career opportunities and emerging trends.',
          venue: 'Zoom / Google Meet',
          venueType: 'Online',
          isOpenTo: 'Open_to_all',
          feeType: 'Free',
          fee: null,
          capacity: 300,
          daysFromNow: 7,
          durationDays: 1,
          status: 'Approved',
          startTime: '14:00:00',
          endTime: '16:00:00',
        },
      ];

    const now = new Date();

    for (const orgRow of createdOrgs) {
      const presidentUserId = orgRow.president_id;
      if (!presidentUserId) continue;

      // Pick 3 distinct templates per org (rotate based on org id)
      const picks = [0, 1, 2, 3, 4].map(i => (i + orgRow.organization_id - 1) % eventTemplates.length);
      const chosenTemplates = [...new Set(picks)].slice(0, 3);

      for (const tplIdx of chosenTemplates) {
        const tpl = eventTemplates[tplIdx];

        const startDate = new Date(now);
        startDate.setDate(startDate.getDate() + tpl.daysFromNow);

        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + tpl.durationDays - 1);

        const imageFilename = `${faker.string.uuid()}.jpg`;

        const createdEvent = await prisma.tbl_event.create({
          data: {
            organization_id: orgRow.organization_id,
            cycle_number: 1,
            event_type: 'Organization',
            user_id: presidentUserId,
            title: tpl.title,
            description: faker.lorem.paragraphs(2, '\n\n') + '\n\n' + tpl.description,
            image: imageFilename,
            venue_type: tpl.venueType,
            venue: tpl.venue,
            start_date: startDate,
            end_date: endDate,
            status: tpl.status,
            type: tpl.feeType,
            is_open_to: tpl.isOpenTo,
            fee: tpl.fee,
            capacity: tpl.capacity,
          },
          select: { event_id: true },
        });

        // Create per-day schedule slots
        for (let day = 0; day < tpl.durationDays; day++) {
          const slotDate = new Date(startDate);
          slotDate.setDate(slotDate.getDate() + day);
          await prisma.tbl_event_schedule.create({
            data: {
              event_id: createdEvent.event_id,
              date: slotDate,
              start_time: new Date(`1970-01-01T${tpl.startTime}Z`),
              end_time: new Date(`1970-01-01T${tpl.endTime}Z`),
              note: day === 0 ? null : `Day ${day + 1}`,
            },
          });
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // 24. EVENT APPLICATIONS, REQUIREMENT SUBMISSIONS & APPROVAL CHAINS
  // -------------------------------------------------------------------------
  console.log('  • event applications & requirement submissions');

  const existingEventApps = await prisma.tbl_event_application.count();

  if (existingEventApps === 0) {
    // Fetch all requirements by phase
    const preEventReqs = await prisma.tbl_event_application_requirement.findMany({
      where: { is_applicable_to: 'pre_event', status: 'active' },
      select: { requirement_id: true, requirement_name: true },
    });
    const postEventReqs = await prisma.tbl_event_application_requirement.findMany({
      where: { is_applicable_to: 'post_event', status: 'active' },
      select: { requirement_id: true, requirement_name: true },
    });

    // Fetch all events with their org/cycle context
    const allEventsForApps = await prisma.tbl_event.findMany({
      select: {
        event_id: true,
        organization_id: true,
        cycle_number: true,
        status: true,
        start_date: true,
        user_id: true,
        tbl_organization: {
          select: {
            adviser_id: true,
            tbl_renewal_cycle: {
              where: { cycle_number: 1 },
              select: {
                tbl_organization_version: { select: { base_program_id: true } },
              },
              take: 1,
            },
          },
        },
      },
    });

    // Fetch SDAO users (for approval chain)
    const sdaoUsers = await prisma.tbl_user.findMany({
      where: { tbl_role: { role_name: 'SDAO' }, status: 'Active' },
      select: { user_id: true },
    });
    const sdaoUserId = sdaoUsers[0]?.user_id ?? userSDAlevel2.user_id;

    // Fetch all approver roles in hierarchy order (mirrors initiateEventApprovalProcess)
    const approverRoles = await prisma.tbl_role.findMany({
      where: { is_approver: true, hierarchy_order: { not: null } },
      orderBy: { hierarchy_order: 'asc' },
      select: { role_id: true, role_name: true, hierarchy_order: true },
    });

    const todayForApps = new Date();
    todayForApps.setHours(0, 0, 0, 0);

    for (const ev of allEventsForApps) {
      if (!ev.organization_id || !ev.cycle_number) continue;

      const isPastEvent = ev.start_date < todayForApps;
      const isApproved = ev.status === 'Approved';

      // Determine application status
      const appStatus = isApproved
        ? 'Approved'
        : (ev.status === 'Pending' ? 'Pending' : 'Revision');

      const submittedAt = new Date(ev.start_date.getTime() - 14 * 24 * 3600_000); // 2 weeks before event

      // 1. Create the event application
      const eventApp = await prisma.tbl_event_application.create({
        data: {
          organization_id: ev.organization_id,
          cycle_number: ev.cycle_number,
          proposed_event_id: ev.event_id,
          applicant_user_id: ev.user_id,
          status: appStatus as any,
          created_at: submittedAt,
          updated_at: submittedAt,
        },
      });

      // 2. Submit pre-event requirements (always — these are submitted when applying)
      const preSubmissions = preEventReqs.map(req => ({
        event_id: ev.event_id,
        event_application_id: eventApp.event_application_id,
        requirement_id: req.requirement_id,
        cycle_number: ev.cycle_number!,
        organization_id: ev.organization_id!,
        file_path: `uploads/events/${ev.event_id}/pre/${req.requirement_id}_${faker.string.alphanumeric(8)}.pdf`,
        submitted_by: ev.user_id,
        submitted_at: submittedAt,
        status: isApproved ? 'Approved' as const : 'Pending' as const,
        viewed_by: isApproved ? sdaoUserId : null,
        viewed_at: isApproved ? new Date(submittedAt.getTime() + 2 * 3600_000) : null,
        reviewed_at: isApproved ? new Date(submittedAt.getTime() + 24 * 3600_000) : null,
        reviewed_by_email: isApproved ? 'sdao.staff1@nu.edu.ph' : null,
        remarks: isApproved ? 'Document received and verified.' : null,
      }));

      await prisma.tbl_event_requirement_submissions.createMany({
        data: preSubmissions,
        skipDuplicates: true,
      });

      // 3. Submit post-event requirements for past approved events
      if (isPastEvent && isApproved && postEventReqs.length > 0) {
        const postSubmittedAt = new Date(ev.start_date.getTime() + 3 * 24 * 3600_000); // 3 days after event
        const postSubmissions = postEventReqs.map(req => ({
          event_id: ev.event_id,
          event_application_id: eventApp.event_application_id,
          requirement_id: req.requirement_id,
          cycle_number: ev.cycle_number!,
          organization_id: ev.organization_id!,
          file_path: `uploads/events/${ev.event_id}/post/${req.requirement_id}_${faker.string.alphanumeric(8)}.pdf`,
          submitted_by: ev.user_id,
          submitted_at: postSubmittedAt,
          status: 'Approved' as const,
          viewed_by: sdaoUserId,
          viewed_at: new Date(postSubmittedAt.getTime() + 4 * 3600_000),
          reviewed_at: new Date(postSubmittedAt.getTime() + 24 * 3600_000),
          reviewed_by_email: 'sdao.staff1@nu.edu.ph',
          remarks: 'Post-event documents reviewed and accepted.',
        }));

        await prisma.tbl_event_requirement_submissions.createMany({
          data: postSubmissions,
          skipDuplicates: true,
        });
      }

      // 4. Build the approval chain
      const adviserId = ev.tbl_organization?.adviser_id ?? null;
      const baseProgramId =
        ev.tbl_organization?.tbl_renewal_cycle?.[0]?.tbl_organization_version?.base_program_id ?? null;

      let stepNumber = 0;
      for (const role of approverRoles) {
        let approverUserId: string | null = null;

        if (role.role_name.toLowerCase().includes('adviser')) {
          approverUserId = adviserId;
        } else if (role.role_name === 'Program Chair' && baseProgramId) {
          const user = await prisma.tbl_user.findFirst({
            where: { role_id: role.role_id, program_id: baseProgramId, status: 'Active' },
            select: { user_id: true },
          });
          approverUserId = user?.user_id ?? null;
        } else {
          const user = await prisma.tbl_user.findFirst({
            where: { role_id: role.role_id, status: 'Active' },
            select: { user_id: true },
          });
          approverUserId = user?.user_id ?? null;
        }

        if (!approverUserId) continue;

        stepNumber++;
        const isApprovedStep = isApproved;
        const approvedAtStep = isApprovedStep
          ? new Date(submittedAt.getTime() + stepNumber * 24 * 3600_000)
          : null;

        await prisma.tbl_event_approval_process.create({
          data: {
            event_application_id: eventApp.event_application_id,
            approver_id: approverUserId,
            approval_role_id: role.role_id,
            status: isApprovedStep ? 'Approved' : (stepNumber === 1 ? 'Pending' : 'Pending'),
            step_number: role.hierarchy_order!,
            comment: isApprovedStep ? 'Approved.' : null,
            approved_at: approvedAtStep,
          },
        });
      }

      console.log(`    ✓ event_id=${ev.event_id} app#${eventApp.event_application_id}: ${preSubmissions.length} pre-reqs${isPastEvent && isApproved ? `, ${postEventReqs.length} post-reqs` : ''}, ${stepNumber} approval steps`);
    }
  }

  // -------------------------------------------------------------------------
  // 25. EVENT ATTENDANCE & EVALUATIONS
  // -------------------------------------------------------------------------
  console.log('  • event attendance & evaluations');

  const existingAttendance = await prisma.tbl_event_attendance.count();

  if (existingAttendance === 0) {
    const allQuestions = await prisma.tbl_evaluation_question.findMany({
      select: { question_id: true, question_type: true },
    });

    const allEvents = await prisma.tbl_event.findMany({
      select: { event_id: true, organization_id: true, start_date: true, status: true },
    });

    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);

    for (const event of allEvents) {
      if (!event.organization_id) continue;
      if (event.status !== 'Approved') continue;

      const isPast = event.start_date < todayDate;

      const members = await prisma.tbl_organization_members.findMany({
        where: { organization_id: event.organization_id, cycle_number: 1, status: 'Active' },
        select: { user_id: true },
      });

      if (members.length === 0) continue;

      let evaluators: any[] = [];
      if (isPast) {
        faker.seed(event.event_id * 13); // deterministic per event
        evaluators = members.filter(() => faker.number.int({ min: 1, max: 10 }) <= 7);
      }

      const timeIn = isPast ? new Date(event.start_date.getTime() + 8 * 3600_000) : null;
      const timeOut = isPast ? new Date(event.start_date.getTime() + 17 * 3600_000) : null;

      // Bulk-insert all attendance rows in one query
      await prisma.tbl_event_attendance.createMany({
        data: members.map(m => {
          const isEvaluator = evaluators.includes(m);
          return {
            event_id: event.event_id,
            user_id: m.user_id,
            status: isPast ? (isEvaluator ? 'Evaluated' : 'Attended') : 'Registered',
            time_in: isPast ? timeIn : null,
            time_out: isPast ? timeOut : null,
          };
        }),
        skipDuplicates: true,
      });

      if (!isPast || evaluators.length === 0) continue;

      // Bulk-insert evaluations
      await prisma.tbl_evaluation.createMany({
        data: evaluators.map(m => ({
          event_id: event.event_id,
          user_id: m.user_id,
          submitted_at: new Date(event.start_date.getTime() + 18 * 3600_000),
          duration_seconds: faker.number.int({ min: 120, max: 600 }),
        })),
        skipDuplicates: true,
      });

      // Re-fetch inserted evaluations to get their generated IDs
      const insertedEvals = await prisma.tbl_evaluation.findMany({
        where: { event_id: event.event_id },
        select: { evaluation_id: true },
      });

      if (insertedEvals.length === 0 || allQuestions.length === 0) continue;

      // Build all response rows and bulk-insert in one query
      const responseRows: Array<{ evaluation_id: number; question_id: number; response_value: string }> = [];
      for (const ev of insertedEvals) {
        faker.seed(ev.evaluation_id * 7);
        for (const q of allQuestions) {
          responseRows.push({
            evaluation_id: ev.evaluation_id,
            question_id: q.question_id,
            response_value: q.question_type === 'textbox'
              ? faker.lorem.sentence()
              : String(faker.number.int({ min: 1, max: 4 })),
          });
        }
      }

      // Insert in chunks of 500 to avoid hitting parameter limits
      const CHUNK = 500;
      for (let i = 0; i < responseRows.length; i += CHUNK) {
        await prisma.tbl_evaluation_response.createMany({
          data: responseRows.slice(i, i + CHUNK),
          skipDuplicates: true,
        });
      }

      console.log(`    ✓ event_id=${event.event_id}: ${members.length} attendance, ${insertedEvals.length} evaluations, ${responseRows.length} responses`);
    }
  }

  // -------------------------------------------------------------------------
  // 26. EVALUATION RESPONSES (backfill for all existing evaluations)
  //     Runs independently of the attendance guard so it always catches up.
  // -------------------------------------------------------------------------
  console.log('  • evaluation responses');

  const existingResponses = await prisma.tbl_evaluation_response.count();

  if (existingResponses === 0) {
    const evalQuestions = await prisma.tbl_evaluation_question.findMany({
      select: { question_id: true, question_type: true },
    });

    const allEvaluations = await prisma.tbl_evaluation.findMany({
      select: { evaluation_id: true, event_id: true },
      orderBy: { evaluation_id: 'asc' },
    });

    if (allEvaluations.length === 0 || evalQuestions.length === 0) {
      console.log('    no evaluations or questions found — skipping');
    } else {
      const RESP_CHUNK = 500;
      let totalResponses = 0;
      const EVAL_BATCH = 50; // process 50 evals at a time to keep memory usage low

      for (let i = 0; i < allEvaluations.length; i += EVAL_BATCH) {
        const batch = allEvaluations.slice(i, i + EVAL_BATCH);
        const responseRows: Array<{ evaluation_id: number; question_id: number; response_value: string }> = [];

        for (const ev of batch) {
          faker.seed(ev.evaluation_id * 7); // deterministic per evaluation
          for (const q of evalQuestions) {
            responseRows.push({
              evaluation_id: ev.evaluation_id,
              question_id: q.question_id,
              response_value: q.question_type === 'textbox'
                ? faker.lorem.sentence()
                : String(faker.number.int({ min: 1, max: 4 })),
            });
          }
        }

        for (let j = 0; j < responseRows.length; j += RESP_CHUNK) {
          await prisma.tbl_evaluation_response.createMany({
            data: responseRows.slice(j, j + RESP_CHUNK),
            skipDuplicates: true,
          });
        }

        totalResponses += responseRows.length;
        console.log(`    ✓ batch ${Math.floor(i / EVAL_BATCH) + 1}: ${batch.length} evals → ${responseRows.length} responses`);
      }

      console.log(`    total: ${allEvaluations.length} evaluations → ${totalResponses} responses seeded`);
    }
  } else {
    console.log(`    ${existingResponses} responses already exist — skipping`);
  }

  console.log('\n✅  Seed complete.');
  console.log(`    Roles:        ${await prisma.tbl_role.count()}`);
  console.log(`    Permissions:  ${await prisma.tbl_permission.count()}`);
  console.log(`    Colleges:     ${await prisma.tbl_college.count()}`);
  console.log(`    Programs:     ${await prisma.tbl_program.count()}`);
  console.log(`    Users:        ${await prisma.tbl_user.count()}`);
  console.log(`    Orgs:         ${await prisma.tbl_organization.count()}`);
  console.log(`    Events:       ${await prisma.tbl_event.count()}`);
  console.log(`    Attendance:   ${await prisma.tbl_event_attendance.count()}`);
  console.log(`    Evaluations:  ${await prisma.tbl_evaluation.count()}`);
  console.log(`    Members:      ${await prisma.tbl_organization_members.count()}`);
  console.log(`    Committees:   ${await prisma.tbl_committee.count()}`);
  console.log(`    Cmt Members:  ${await prisma.tbl_committee_members.count()}`);
  console.log(`    Transactions: ${await prisma.tbl_transaction.count()}`);
  console.log(`    Event Apps:   ${await prisma.tbl_event_application.count()}`);
  console.log(`    Req Submis.:  ${await prisma.tbl_event_requirement_submissions.count()}`);
  console.log(`    Approvals:    ${await prisma.tbl_event_approval_process.count()}`);
  console.log(`    Eval Resps:   ${await prisma.tbl_evaluation_response.count()}`);
}

main()
  .catch((e) => {
    console.error('❌  Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
