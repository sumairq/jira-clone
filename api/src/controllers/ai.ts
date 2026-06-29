import { Issue } from 'entities';
import { catchErrors } from 'errors';
import { findEntityOrThrow } from 'utils/typeorm';
import { generateSubtaskSuggestions } from 'utils/ai';

export const generateSubtasks = catchErrors(async (req, res) => {
  const issue = await findEntityOrThrow(Issue, { where: { id: req.params.issueId as string } });
  const subtasks = await generateSubtaskSuggestions(issue.title, issue.descriptionText);
  res.respond({ subtasks });
});
