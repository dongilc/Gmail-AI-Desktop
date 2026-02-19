import { google, Auth, tasks_v1 } from 'googleapis';
import { Task, TaskList } from '../../src/types';

const EMAIL_LINK_MARKER = '<!-- EMAIL_LINK:';
const EMAIL_LINK_END_MARKER = ':END_EMAIL_LINK -->';

export class TasksService {
  private getClient(auth: Auth.OAuth2Client): tasks_v1.Tasks {
    return google.tasks({ version: 'v1', auth });
  }

  // notes에서 emailLink 추출
  private parseEmailLinkFromNotes(notes: string | undefined): { emailLink?: Task['emailLink']; cleanNotes?: string } {
    if (!notes) return {};

    const startIdx = notes.indexOf(EMAIL_LINK_MARKER);
    if (startIdx === -1) return { cleanNotes: notes };

    const endIdx = notes.indexOf(EMAIL_LINK_END_MARKER);
    if (endIdx === -1) return { cleanNotes: notes };

    try {
      const jsonStr = notes.substring(startIdx + EMAIL_LINK_MARKER.length, endIdx);
      const emailLink = JSON.parse(jsonStr);
      const cleanNotes = (notes.substring(0, startIdx) + notes.substring(endIdx + EMAIL_LINK_END_MARKER.length)).trim();
      return { emailLink, cleanNotes: cleanNotes || undefined };
    } catch {
      return { cleanNotes: notes };
    }
  }

  // emailLink를 notes에 추가
  private appendEmailLinkToNotes(notes: string | undefined, emailLink: Task['emailLink']): string {
    const emailLinkJson = `${EMAIL_LINK_MARKER}${JSON.stringify(emailLink)}${EMAIL_LINK_END_MARKER}`;
    const displayInfo = `\n\n---\n📧 ${emailLink?.subject}\n보낸 사람: ${emailLink?.from}`;
    return (notes || '') + displayInfo + '\n' + emailLinkJson;
  }

  async getTaskLists(auth: Auth.OAuth2Client): Promise<TaskList[]> {
    const tasks = this.getClient(auth);

    const response = await tasks.tasklists.list({
      maxResults: 100,
    });

    const taskLists: TaskList[] = [];

    if (response.data.items) {
      for (const list of response.data.items) {
        if (!list.id) continue;

        taskLists.push({
          id: list.id,
          title: list.title || '(제목 없음)',
          accountId: '', // 호출자가 설정
        });
      }
    }

    return taskLists;
  }

  async getTasks(auth: Auth.OAuth2Client, taskListId: string): Promise<Task[]> {
    const tasksClient = this.getClient(auth);

    const response = await tasksClient.tasks.list({
      tasklist: taskListId,
      maxResults: 100,
      showCompleted: true,
      showHidden: true,
    });

    const tasks: Task[] = [];

    if (response.data.items) {
      for (const task of response.data.items) {
        if (!task.id) continue;

        // notes에서 emailLink 파싱
        const { emailLink, cleanNotes } = this.parseEmailLinkFromNotes(task.notes || undefined);

        tasks.push({
          id: task.id,
          accountId: '', // 호출자가 설정
          taskListId,
          title: task.title || '',
          notes: cleanNotes,
          due: task.due ? new Date(task.due) : undefined,
          completed: task.status === 'completed',
          completedDate: task.completed ? new Date(task.completed) : undefined,
          position: task.position || '0',
          parent: task.parent || undefined,
          emailLink,
        });
      }
    }

    return tasks;
  }

  async createTask(
    auth: Auth.OAuth2Client,
    taskListId: string,
    task: Partial<Task>
  ): Promise<Task> {
    const tasksClient = this.getClient(auth);

    let notes = task.notes;

    // 이메일 링크가 있으면 notes에 추가
    if (task.emailLink) {
      notes = this.appendEmailLinkToNotes(notes, task.emailLink);
    }

    const taskBody: tasks_v1.Schema$Task = {
      title: task.title,
      notes,
      due: task.due?.toISOString(),
      status: task.completed ? 'completed' : 'needsAction',
    };

    const response = await tasksClient.tasks.insert({
      tasklist: taskListId,
      requestBody: taskBody,
    });

    const { emailLink, cleanNotes } = this.parseEmailLinkFromNotes(response.data.notes || undefined);

    return {
      id: response.data.id!,
      accountId: task.accountId || '',
      taskListId,
      title: response.data.title || '',
      notes: cleanNotes,
      due: response.data.due ? new Date(response.data.due) : undefined,
      completed: response.data.status === 'completed',
      completedDate: response.data.completed ? new Date(response.data.completed) : undefined,
      position: response.data.position || '0',
      parent: response.data.parent || undefined,
      emailLink: emailLink || task.emailLink,
    };
  }

  async updateTask(
    auth: Auth.OAuth2Client,
    taskListId: string,
    task: Task
  ): Promise<Task> {
    const tasksClient = this.getClient(auth);

    // emailLink가 있으면 notes에 포함
    let notes = task.notes;
    if (task.emailLink) {
      notes = this.appendEmailLinkToNotes(notes, task.emailLink);
    }

    const taskBody: tasks_v1.Schema$Task = {
      id: task.id,
      title: task.title,
      notes,
      due: task.due?.toISOString(),
      status: task.completed ? 'completed' : 'needsAction',
    };

    const response = await tasksClient.tasks.update({
      tasklist: taskListId,
      task: task.id,
      requestBody: taskBody,
    });

    const { emailLink, cleanNotes } = this.parseEmailLinkFromNotes(response.data.notes || undefined);

    return {
      id: response.data.id!,
      accountId: task.accountId,
      taskListId,
      title: response.data.title || '',
      notes: cleanNotes,
      due: response.data.due ? new Date(response.data.due) : undefined,
      completed: response.data.status === 'completed',
      completedDate: response.data.completed ? new Date(response.data.completed) : undefined,
      position: response.data.position || '0',
      parent: response.data.parent || undefined,
      emailLink: emailLink || task.emailLink,
    };
  }

  async deleteTask(
    auth: Auth.OAuth2Client,
    taskListId: string,
    taskId: string
  ): Promise<void> {
    const tasksClient = this.getClient(auth);

    await tasksClient.tasks.delete({
      tasklist: taskListId,
      task: taskId,
    });
  }

  async completeTask(
    auth: Auth.OAuth2Client,
    taskListId: string,
    taskId: string
  ): Promise<void> {
    const tasksClient = this.getClient(auth);

    await tasksClient.tasks.patch({
      tasklist: taskListId,
      task: taskId,
      requestBody: {
        status: 'completed',
      },
    });
  }

  async uncompleteTask(
    auth: Auth.OAuth2Client,
    taskListId: string,
    taskId: string
  ): Promise<void> {
    const tasksClient = this.getClient(auth);

    await tasksClient.tasks.patch({
      tasklist: taskListId,
      task: taskId,
      requestBody: {
        status: 'needsAction',
        completed: null,
      },
    });
  }

  async moveTask(
    auth: Auth.OAuth2Client,
    taskListId: string,
    taskId: string,
    previousTaskId?: string
  ): Promise<Task> {
    const tasksClient = this.getClient(auth);

    const response = await tasksClient.tasks.move({
      tasklist: taskListId,
      task: taskId,
      previous: previousTaskId || undefined,
    });

    const { emailLink, cleanNotes } = this.parseEmailLinkFromNotes(response.data.notes || undefined);

    return {
      id: response.data.id!,
      accountId: '',
      taskListId,
      title: response.data.title || '',
      notes: cleanNotes,
      due: response.data.due ? new Date(response.data.due) : undefined,
      completed: response.data.status === 'completed',
      completedDate: response.data.completed ? new Date(response.data.completed) : undefined,
      position: response.data.position || '0',
      parent: response.data.parent || undefined,
      emailLink,
    };
  }
}
