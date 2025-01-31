import { Injectable } from '@nestjs/common';
import { Post } from '@prisma/client';
import { NewPost, UpdatePost } from 'src/graphql.schema';
import { PrismaService } from '../prisma/prisma.service';

/**
 * PostsService is a service class that provides CRUD operations for managing posts.
 *
 * @class
 * @public
 * @module PostsService
 */
@Injectable()
export class PostsService {
  constructor(private prisma: PrismaService) {}

  /**
 * Retrieves a single post by its ID.
 * 
 * @param id - The ID of the post to retrieve.
 * @returns A Promise that resolves to the retrieved post, or null if no post is found.
 */
  async findOne(id: string): Promise<Post | null> {
    return this.prisma.post.findUnique({
      where: {
        id,
      },
    });
  }

  /**
 * Retrieves all posts.
 * 
 * @returns A Promise that resolves to an array of posts.
 */
  async findAll(): Promise<Post[]> {
    return this.prisma.post.findMany({});
  }

  /**
 * Creates a new post.
 * 
 * @param input - The input data for the new post.
 * @returns A Promise that resolves to the created post.
 */
  async create(input: NewPost): Promise<Post> {
    return this.prisma.post.create({
      data: input,
    });
  }

  /**
 * Updates a post with the specified parameters.
 * 
 * @param params - The parameters for updating the post.
 * @returns A Promise that resolves to the updated post.
 */
  async update(params: UpdatePost): Promise<Post> {
    const { id, ...params_without_id } = params;

    return this.prisma.post.update({
      where: {
        id,
      },
      data: {
        ...params_without_id,
      },
    });
  }

  /**
 * Deletes a post with the specified ID.
 * 
 * @param id - The ID of the post to delete.
 * @returns A Promise that resolves to the deleted post.
 */
  async delete(id: string): Promise<Post> {
    return this.prisma.post.delete({
      where: {
        id,
      },
    });
  }
}
