import ProjectDao from '../../dao/project.dao';
import { IProject, pagination } from '../../interfaces';
import ErrorHandler from '../../utils/error-handler';

// Fields a student may set. Anything else in the body (userId, _id,
// activeNodesCount, timestamps) is ignored, so a project can't be handed
// to another user or have its counts faked.
const EDITABLE_FIELDS = ['title', 'description', 'nodes', 'edges', 'code'] as const;

const pickEditable = (data: Partial<IProject> = {}): Partial<IProject> => {
  const picked: Record<string, unknown> = {};
  for (const key of EDITABLE_FIELDS) {
    if (data[key] !== undefined) picked[key] = data[key];
  }
  return picked as Partial<IProject>;
};

export const createProjectService = async (
  userId: string,
  data: Partial<IProject>
): Promise<IProject> => {
  if (!userId) {
    throw new ErrorHandler(401, 'User ID is required to create a project');
  }

  const projectData: Partial<IProject> = {
    ...pickEditable(data),
    userId,
    title: data.title?.trim() || 'Untitled Project',
    activeNodesCount: Array.isArray(data.nodes) ? data.nodes.length : 0
  };

  return await ProjectDao.create(projectData);
};

export const listProjectsService = async (
  userId: string,
  queryOptions: {
    page?: number;
    limit?: number;
    search?: string;
  } = {}
): Promise<{
  projects: IProject[];
  pagination: pagination;
}> => {
  if (!userId) {
    throw new ErrorHandler(401, 'User ID is required to list projects');
  }

  const filter: Record<string, any> = { userId };
  if (queryOptions.search) {
    filter.search = queryOptions.search;
  }

  return await ProjectDao.list(filter, {
    page: queryOptions.page,
    limit: queryOptions.limit,
    sort: { updatedAt: -1 }
  });
};

export const getProjectByIdService = async (
  userId: string,
  id: string
): Promise<IProject> => {
  const project = await ProjectDao.findByUserAndId(userId, id);
  if (!project) {
    throw new ErrorHandler(404, `Project not found or unauthorized`);
  }
  return project;
};

export const updateProjectService = async (
  userId: string,
  id: string,
  data: Partial<IProject>
): Promise<IProject> => {
  const existing = await ProjectDao.findByUserAndId(userId, id);
  if (!existing) {
    throw new ErrorHandler(404, `Project not found or unauthorized`);
  }

  const updateData: Partial<IProject> = pickEditable(data);

  if (Array.isArray(data.nodes)) {
    updateData.activeNodesCount = data.nodes.length;
  }
  if (typeof data.title === 'string') {
    updateData.title = data.title.trim() || 'Untitled Project';
  }

  const updated = await ProjectDao.updateForUser(userId, id, updateData);
  if (!updated) {
    throw new ErrorHandler(500, 'Failed to update project');
  }
  return updated;
};

export const deleteProjectService = async (
  userId: string,
  id: string
): Promise<{ success: boolean; message: string }> => {
  const existing = await ProjectDao.findByUserAndId(userId, id);
  if (!existing) {
    throw new ErrorHandler(404, `Project not found or unauthorized`);
  }

  await ProjectDao.deleteForUser(userId, id);
  return { success: true, message: 'Project deleted successfully' };
};
