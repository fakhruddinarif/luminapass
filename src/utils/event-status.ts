import { eventStatusEnum } from "../entities";

export type EventStatus = (typeof eventStatusEnum.enumValues)[number];

export interface ResolveEventStatusInput {
  currentStatus: EventStatus;
  startsAt: Date;
  endsAt: Date | null;
  saleStartsAt: Date;
  saleEndsAt: Date | null;
  totalCapacity: number;
  sectionCount: number;
  now?: Date;
}

export function resolveEventLifecycleStatus(
  input: ResolveEventStatusInput,
): EventStatus {
  const now = input.now ?? new Date();

  // Draft and cancelled are explicit admin states and are not auto-overridden.
  if (input.currentStatus === "draft" || input.currentStatus === "cancelled") {
    return input.currentStatus;
  }

  if (input.endsAt && now >= input.endsAt) {
    return "finished";
  }

  if (now >= input.startsAt && (!input.endsAt || now < input.endsAt)) {
    return "live";
  }

  const saleWindowOpen =
    now >= input.saleStartsAt && (!input.saleEndsAt || now <= input.saleEndsAt);

  if (saleWindowOpen) {
    if (input.sectionCount > 0 && input.totalCapacity <= 0) {
      return "sold_out";
    }

    return "on_sale";
  }

  return "published";
}
