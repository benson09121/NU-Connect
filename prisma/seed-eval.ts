import 'dotenv/config';
import { PrismaClient } from '../lib/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('  • checking existing evaluation questions...');
  
  const existingEvalGroups = await prisma.tbl_evaluation_question_group.count();

  if (existingEvalGroups > 0) {
    console.log(`  • Found ${existingEvalGroups} existing groups. Skipping seed to prevent duplicates or foreign key errors.`);
    return;
  }

  console.log('  • seeding evaluation questions...');
  
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

  console.log('  • successfully seeded evaluation questions!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
