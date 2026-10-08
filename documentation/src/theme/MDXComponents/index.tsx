import MDXComponents from "@theme-original/MDXComponents";
import DomainNav from "@site/src/components/DomainNav";
import Record from "@site/src/components/Record";
import { Step, StepList, Steps } from "@site/src/components/Step";
import { Action, ActionList } from "@site/src/components/Action";
import { Agent, Chat, Expect, You } from "@site/src/components/Chat";

/* Available in every .mdx page without an import. */
export default { ...MDXComponents, Action, ActionList, Agent, Chat, DomainNav, Expect, Record, Step, StepList, Steps, You };
