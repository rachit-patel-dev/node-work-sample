import { Resolver, Query, Mutation, Args, Subscription } from '@nestjs/graphql';
import { PostsService } from './posts.service';
import { Post, NewPost, UpdatePost } from 'src/graphql.schema';
import { PubSub } from 'graphql-subscriptions';

const pubSub = new PubSub();

/**
 * PostsResolvers class handles the resolver functions for the 'Post' entity in the GraphQL schema.
 * It provides methods to query, create, update, and delete posts, as well as subscribe to post creation events.
 */
@Resolver('Post')
export class PostsResolvers {
  constructor(private readonly postService: PostsService) {}

  /**
 * Retrieves all posts.
 * 
 * @returns {Promise<Post[]>} A promise that resolves to an array of posts.
 */
  @Query('posts')
  async posts(): Promise<Post[]> {
    return this.postService.findAll();
  }

  /**
 * Retrieves a single post by its ID.
 * 
 * @param {string} id - The ID of the post.
 * @returns {Promise<Post>} A promise that resolves to the post with the specified ID.
 */
  @Query('post')
  async post(@Args('id') args: string): Promise<Post> {
    return this.postService.findOne(args);
  }

  /**
 * Creates a new post.
 * 
 * @param {NewPost} args - The input data for the new post.
 * @returns {Promise<Post>} A promise that resolves to the newly created post.
 */
  @Mutation('createPost')
  async create(@Args('input') args: NewPost): Promise<Post> {
    const createdPost = await this.postService.create(args);
    pubSub.publish('postCreated', { postCreated: createdPost });
    return createdPost;
  }

  /**
 * Updates a post with the specified ID.
 * 
 * @param {UpdatePost} args - The input data for updating the post.
 * @returns {Promise<Post>} A promise that resolves to the updated post.
 */
  @Mutation('updatePost')
  async update(@Args('input') args: UpdatePost): Promise<Post> {
    return this.postService.update(args);
  }

  /**
 * Deletes a post with the specified ID.
 * 
 * @param {string} id - The ID of the post to be deleted.
 * @returns {Promise<Post>} A promise that resolves to the deleted post.
 */
  @Mutation('deletePost')
  async delete(@Args('id') args: string): Promise<Post> {
    return this.postService.delete(args);
  }

  /**
 * Subscribes to the 'postCreated' event and returns an async iterator.
 * 
 * @returns {AsyncIterator<any>} An async iterator that emits the 'postCreated' event.
 */
  @Subscription('postCreated')
  postCreated() {
    return pubSub.asyncIterator('postCreated');
  }
}
