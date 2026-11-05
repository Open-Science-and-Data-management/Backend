// reviews controller — บาง; HTTP boundary เท่านั้น
import { Controller, Get, Inject, Query } from "@nestjs/common";
import type { AccessClaims } from "@/features/auth/jwt.js";
import { CurrentUser } from "@/features/auth/session.js";
import { ReviewsService } from "./reviews.service.js";

@Controller("reviews")
export class ReviewsController {
  constructor(@Inject(ReviewsService) private readonly reviews: ReviewsService) {}

  @Get()
  list(
    @CurrentUser() user: AccessClaims,
    @Query()
    query: {
      status?: string | string[];
      decided_by?: string;
      project_id?: string;
      submitted_after?: string;
      sort?: string;
      limit?: string;
      starting_after?: string;
    },
  ) {
    return this.reviews.list(user, query);
  }
}
