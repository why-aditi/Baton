import { z } from 'zod';

const nonEmpty = z.string().trim().min(1);

export const questionsSchema = z.object({
  questions: z
    .array(z.object({ id: nonEmpty, text: nonEmpty, itemAris: z.array(nonEmpty).min(1) }))
    .min(5)
    .max(10),
});

export const itemSummariesSchema = z.object({
  items: z.array(z.object({ ari: nonEmpty, oneLine: nonEmpty })),
});

export const summarySchema = z.object({
  overview: nonEmpty,
  risks: z.array(nonEmpty),
  sections: z.array(z.object({ ownerAri: nonEmpty, body: nonEmpty, itemAris: z.array(nonEmpty) })),
});

export const schemas = {
  questions: questionsSchema,
  itemSummaries: itemSummariesSchema,
  summary: summarySchema,
};

export type Task = keyof typeof schemas;
export type Output<T extends Task> = z.infer<(typeof schemas)[T]>;
export type Questions = Output<'questions'>;
export type ItemSummaries = Output<'itemSummaries'>;
export type Summary = Output<'summary'>;
