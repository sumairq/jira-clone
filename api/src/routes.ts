import * as ai from 'controllers/ai';
import * as authentication from 'controllers/authentication';
import * as comments from 'controllers/comments';
import * as issues from 'controllers/issues';
import * as projects from 'controllers/projects';
import * as test from 'controllers/test';
import * as users from 'controllers/users';

export const attachPublicRoutes = (app: any): void => {
  if (process.env.NODE_ENV === 'test') {
    app.delete('/test/reset-database', test.resetDatabase);
    app.post('/test/create-account', test.createAccount);
  }

  app.post('/authentication/guest', authentication.createGuestAccount);
  app.post('/authentication/register', authentication.register);
  app.post('/authentication/login', authentication.login);
};

export const attachPrivateRoutes = (app: any): void => {
  app.post('/comments', comments.create);
  app.put('/comments/:commentId', comments.update);
  app.delete('/comments/:commentId', comments.remove);

  app.get('/issues', issues.getProjectIssues);
  app.get('/issues/:issueId', issues.getIssueWithUsersAndComments);
  app.post('/issues', issues.create);
  app.put('/issues/:issueId', issues.update);
  app.delete('/issues/:issueId', issues.remove);
  app.post('/issues/:issueId/generate-subtasks', ai.generateSubtasks);

  app.get('/project', projects.getProjectWithUsersAndIssues);
  app.put('/project', projects.update);
  app.post('/project/switch', projects.switchBoard);
  app.get('/projects', projects.list);
  app.post('/projects', projects.create);

  app.get('/currentUser', users.getCurrentUser);
  app.put('/currentUser', users.updateCurrentUser);
};
